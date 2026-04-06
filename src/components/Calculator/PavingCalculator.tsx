import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { carrierSpeeds, getMaterialCapacity, DEFAULT_CARRIER_SPEED_M_PER_H } from '../../constants/materialCapacity';
import { translateTaskName, translateUnit, translateMaterialName } from '../../lib/translationMap';
import { CompactorSelector, type CompactorOption } from './CompactorSelector';
import { calculateCompactingTime } from '../../lib/compactingCalculations';
import { computeCobblestoneCuts, computeMonoblockFrameBlocks } from '../../projectmanagement/canvacreator/visualization/cobblestonePattern';
import {
  MONOBLOCK_MIXES,
  getMonoblockMixById,
  singleSizeToBlockCm,
  defaultMonoblockMixEnabled,
  type MonoblockLayoutMode,
  type MonoblockSingleSizeKey,
  type MonoblockMixPieceKey,
} from '../../projectmanagement/canvacreator/visualization/monoblockMix';
import { groupCutsByLength, getFrameBorderRowCount } from '../../projectmanagement/canvacreator/visualization/slabPattern';
import { isPathElement, getPathPolygon } from '../../projectmanagement/canvacreator/linearElements';
import { getEffectivePolygon, getEffectivePolygonWithEdgeIndices } from '../../projectmanagement/canvacreator/arcMath';
import { FrameSidesSelector } from '../../projectmanagement/canvacreator/objectCard/FrameSidesSelector';
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
  Badge,
} from '../../themes/uiComponents';

interface Material {
  name: string;
  amount: number;
  unit: string;
  price_per_unit: number | null;
  total_price: number | null;
}

interface MaterialUsageConfig {
  calculator_id: string;
  material_id: string;
}

interface Shape {
  points: { x: number; y: number }[];
  closed: boolean;
  calculatorInputs?: Record<string, any>;
}

interface PavingCalculatorProps {
  onResultsChange?: (results: any) => void;
  onInputsChange?: (inputs: Record<string, any>) => void;
  isInProjectCreating?: boolean;
  initialArea?: number;
  savedInputs?: Record<string, any>;
  shape?: Shape;
  /** Fill-in tonnes when terrain is too low (from preparation) */
  fillTonnes?: number;
  /** Leveling material for fill: tape1 or soil */
  levelingMaterial?: 'tape1' | 'soil';
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

interface DiggingEquipment {
  id: string;
  name: string;
  type: string;
  "size (in tones)": number;
}

const PavingCalculator: React.FC<PavingCalculatorProps> = ({ 
  onResultsChange, 
  onInputsChange,
  isInProjectCreating = false,
  initialArea,
  savedInputs = {},
  shape = undefined,
  fillTonnes = 0,
  levelingMaterial = 'tape1',
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
}) => {
  const { t } = useTranslation(['calculator', 'utilities', 'common', 'units']);
  const companyId = useAuthStore(state => state.getCompanyId());
  const initArea = savedInputs?.area != null ? String(savedInputs.area) : (initialArea != null ? initialArea.toFixed(3) : '');
  const [area, setArea] = useState<string>(initArea);
  useEffect(() => {
    if (savedInputs?.area != null) setArea(String(savedInputs.area));
    else if (initialArea != null && isInProjectCreating) setArea(initialArea.toFixed(3));
  }, [savedInputs?.area, initialArea, isInProjectCreating]);
  const [sandThicknessCm, setSandThicknessCm] = useState<string>(savedInputs?.sandThicknessCm ?? '');
  const [tape1ThicknessCm, setTape1ThicknessCm] = useState<string>(savedInputs?.tape1ThicknessCm ?? '');
  const [monoBlocksHeightCm, setMonoBlocksHeightCm] = useState<string>(savedInputs?.monoBlocksHeightCm ?? '');
  const [cutBlocks, setCutBlocks] = useState<string>(savedInputs?.cutBlocks ?? '');
  const [soilExcessCm, setSoilExcessCm] = useState<string>(savedInputs?.soilExcessCm ?? '');
  const [addFrameToMonoblock, setAddFrameToMonoblock] = useState<boolean>(!!savedInputs?.addFrameToMonoblock);
  const [framePieceLengthCm, setFramePieceLengthCm] = useState<string>(savedInputs?.framePieceLengthCm ?? '20');
  const [framePieceWidthCm, setFramePieceWidthCm] = useState<string>(savedInputs?.framePieceWidthCm ?? '10');
  const [frameBorderRowCount, setFrameBorderRowCount] = useState<string>(
    String(
      savedInputs?.frameBorderRowCount != null && Number.isFinite(Number(savedInputs.frameBorderRowCount))
        ? Math.max(1, Math.min(50, Math.floor(Number(savedInputs.frameBorderRowCount))))
        : getFrameBorderRowCount(savedInputs as Record<string, unknown> | undefined)
    )
  );
  const [frameJointType, setFrameJointType] = useState<'butt' | 'miter45'>(savedInputs?.frameJointType ?? 'butt');
  const [frameSidesEnabled, setFrameSidesEnabled] = useState<boolean[]>(Array.isArray(savedInputs?.frameSidesEnabled) ? savedInputs.frameSidesEnabled : []);
  const [frameBorderMaterial, setFrameBorderMaterial] = useState<'slab' | 'cobble'>(() =>
    savedInputs?.frameBorderMaterial === 'slab' || savedInputs?.frameBorderMaterial === 'cobble'
      ? savedInputs.frameBorderMaterial
      : 'cobble'
  );

  const [monoblockLayoutMode, setMonoblockLayoutMode] = useState<MonoblockLayoutMode>(() =>
    savedInputs?.monoblockLayoutMode === 'mix' || savedInputs?.monoblockLayoutMode === 'single'
      ? savedInputs.monoblockLayoutMode
      : 'single'
  );
  const [monoblockSingleSize, setMonoblockSingleSize] = useState<MonoblockSingleSizeKey>(() =>
    savedInputs?.monoblockSingleSize === '10x10' ? '10x10' : '20x10'
  );
  const [monoblockMixId, setMonoblockMixId] = useState<string>(() =>
    String(savedInputs?.monoblockMixId ?? MONOBLOCK_MIXES[0].id)
  );
  const [monoblockMixEnabledSizes, setMonoblockMixEnabledSizes] = useState<Record<MonoblockMixPieceKey, boolean>>(() => {
    const d = defaultMonoblockMixEnabled();
    const s = savedInputs?.monoblockMixEnabledSizes as Partial<Record<MonoblockMixPieceKey, boolean>> | undefined;
    return s ? { ...d, ...s } : d;
  });

  useEffect(() => {
    if (savedInputs?.addFrameToMonoblock !== undefined) setAddFrameToMonoblock(!!savedInputs.addFrameToMonoblock);
    if (savedInputs?.framePieceLengthCm != null) setFramePieceLengthCm(String(savedInputs.framePieceLengthCm));
    if (savedInputs?.framePieceWidthCm != null) setFramePieceWidthCm(String(savedInputs.framePieceWidthCm));
    if (savedInputs?.frameBorderRowCount != null && Number.isFinite(Number(savedInputs.frameBorderRowCount))) {
      setFrameBorderRowCount(String(Math.max(1, Math.min(50, Math.floor(Number(savedInputs.frameBorderRowCount))))));
    }
    if (savedInputs?.frameJointType === 'butt' || savedInputs?.frameJointType === 'miter45') setFrameJointType(savedInputs.frameJointType);
    if (Array.isArray(savedInputs?.frameSidesEnabled)) setFrameSidesEnabled(savedInputs.frameSidesEnabled);
    if (savedInputs?.monoblockLayoutMode === 'mix' || savedInputs?.monoblockLayoutMode === 'single') {
      setMonoblockLayoutMode(savedInputs.monoblockLayoutMode);
    }
    if (savedInputs?.monoblockSingleSize === '10x10' || savedInputs?.monoblockSingleSize === '20x10') {
      setMonoblockSingleSize(savedInputs.monoblockSingleSize);
    }
    if (savedInputs?.monoblockMixId != null) setMonoblockMixId(String(savedInputs.monoblockMixId));
    if (savedInputs?.monoblockMixEnabledSizes && typeof savedInputs.monoblockMixEnabledSizes === 'object') {
      setMonoblockMixEnabledSizes({ ...defaultMonoblockMixEnabled(), ...savedInputs.monoblockMixEnabledSizes });
    }
    if (savedInputs?.frameBorderMaterial === 'slab' || savedInputs?.frameBorderMaterial === 'cobble') {
      setFrameBorderMaterial(savedInputs.frameBorderMaterial);
    }
  }, [savedInputs?.addFrameToMonoblock, savedInputs?.framePieceLengthCm, savedInputs?.framePieceWidthCm, savedInputs?.frameBorderRowCount, savedInputs?.frameJointType, savedInputs?.frameSidesEnabled, savedInputs?.frameBorderMaterial, savedInputs?.monoblockLayoutMode, savedInputs?.monoblockSingleSize, savedInputs?.monoblockMixId, savedInputs?.monoblockMixEnabledSizes]);

  useEffect(() => {
    if (savedInputs?.tape1ThicknessCm != null && savedInputs.tape1ThicknessCm !== '') setTape1ThicknessCm(String(savedInputs.tape1ThicknessCm));
    if (savedInputs?.sandThicknessCm != null && savedInputs.sandThicknessCm !== '') setSandThicknessCm(String(savedInputs.sandThicknessCm));
    if (savedInputs?.monoBlocksHeightCm != null && savedInputs.monoBlocksHeightCm !== '') setMonoBlocksHeightCm(String(savedInputs.monoBlocksHeightCm));
  }, [savedInputs?.tape1ThicknessCm, savedInputs?.sandThicknessCm, savedInputs?.monoBlocksHeightCm]);
  const [frameResults, setFrameResults] = useState<{
    totalFrameBlocks: number;
    totalFrameAreaM2: number;
    frameAngleCuts: number;
    sides: Array<{ length: number; blocks: number }>;
  } | null>(null);
  const [canvasCutGroups, setCanvasCutGroups] = useState<{ lengthCm: number; count: number }[]>([]);
  const onResultsChangeRef = useRef(onResultsChange);
  onResultsChangeRef.current = onResultsChange;
  const onInputsChangeRef = useRef(onInputsChange);
  onInputsChangeRef.current = onInputsChange;

  /** Fallback when DB view returns null dynamic estimate (avoids 0 h + console noise). */
  const DEFAULT_LAYING_MONOBLOCKS_H_PER_M2 = 0.05;
  const COBBLE_FRAME_LAYING_BLOCKS_PER_HOUR = 60;

  useEffect(() => {
    if (!isInProjectCreating || !shape?.calculatorInputs || !shape.closed || shape.points.length < 3) {
      setCanvasCutGroups([]);
      return;
    }
    const inputs = {
      ...shape.calculatorInputs,
      blockWidthCm: shape.calculatorInputs?.blockWidthCm ?? 20,
      blockLengthCm: shape.calculatorInputs?.blockLengthCm ?? 10,
      jointGapMm: shape.calculatorInputs?.jointGapMm ?? 1,
      monoblockLayoutMode: shape.calculatorInputs?.monoblockLayoutMode,
      monoblockMixId: shape.calculatorInputs?.monoblockMixId,
      monoblockMixEnabledSizes: shape.calculatorInputs?.monoblockMixEnabledSizes,
    };
    const { fullBlockCount, cutBlockCount, cuts, wasteSatisfiedPositions, wasteAreaCm2, reusedAreaCm2 } = computeCobblestoneCuts(shape as any, inputs);
    setCutBlocks(String(cutBlockCount));
    setCanvasCutGroups(cuts.length > 0 ? groupCutsByLength(cuts) : []);
    const fn = onInputsChangeRef.current;
    if (fn) {
      const prev = shape.calculatorInputs ?? {};
      const next = {
        vizWasteSatisfied: wasteSatisfiedPositions ?? [],
        vizFullBlockCount: fullBlockCount,
        cutBlocks: String(cutBlockCount),
        vizWasteAreaCm2: wasteAreaCm2,
        vizReusedAreaCm2: reusedAreaCm2,
      };
      const same = prev.vizWasteAreaCm2 === next.vizWasteAreaCm2
        && prev.vizReusedAreaCm2 === next.vizReusedAreaCm2
        && prev.vizFullBlockCount === next.vizFullBlockCount
        && prev.cutBlocks === next.cutBlocks
        && JSON.stringify(prev.vizWasteSatisfied ?? []) === JSON.stringify(next.vizWasteSatisfied);
      if (!same) fn(next);
    }
  }, [isInProjectCreating, shape?.calculatorInputs?.blockWidthCm, shape?.calculatorInputs?.blockLengthCm, shape?.calculatorInputs?.jointGapMm, shape?.calculatorInputs?.vizPattern, shape?.calculatorInputs?.vizDirection, shape?.calculatorInputs?.vizStartCorner, shape?.calculatorInputs?.vizOriginOffsetX, shape?.calculatorInputs?.vizOriginOffsetY, shape?.calculatorInputs?.addFrameToMonoblock, shape?.calculatorInputs?.framePieceWidthCm, shape?.calculatorInputs?.frameBorderRowCount, shape?.calculatorInputs?.monoblockLayoutMode, shape?.calculatorInputs?.monoblockMixId, JSON.stringify(shape?.calculatorInputs?.monoblockMixEnabledSizes), JSON.stringify(shape?.points), shape?.closed]);

  const lastInputsSentRef = useRef<string>("");
  useEffect(() => {
    if (!isInProjectCreating) return;
    const fn = onInputsChangeRef.current;
    if (!fn) return;
    const singleDims = singleSizeToBlockCm(monoblockSingleSize);
    const next = {
      area, sandThicknessCm, tape1ThicknessCm, monoBlocksHeightCm, cutBlocks, soilExcessCm,
      monoblockLayoutMode,
      monoblockSingleSize: monoblockLayoutMode === 'single' ? monoblockSingleSize : undefined,
      monoblockMixId: monoblockLayoutMode === 'mix' ? monoblockMixId : undefined,
      monoblockMixEnabledSizes: monoblockLayoutMode === 'mix' ? monoblockMixEnabledSizes : undefined,
      blockWidthCm: monoblockLayoutMode === 'single' ? singleDims.blockWidthCm : 10,
      blockLengthCm: monoblockLayoutMode === 'single' ? singleDims.blockLengthCm : 20,
      jointGapMm: 1,
      addFrameToMonoblock: addFrameToMonoblock ? true : undefined,
      framePieceLengthCm: addFrameToMonoblock ? framePieceLengthCm : undefined,
      framePieceWidthCm: addFrameToMonoblock ? framePieceWidthCm : undefined,
      frameBorderRowCount: addFrameToMonoblock ? Math.max(1, Math.min(50, Math.floor(Number(frameBorderRowCount) || 1))) : undefined,
      frameJointType: addFrameToMonoblock ? frameJointType : undefined,
      frameSidesEnabled: addFrameToMonoblock ? frameSidesEnabled : undefined,
      frameBorderMaterial: addFrameToMonoblock ? frameBorderMaterial : undefined,
    };
    const key = JSON.stringify(next);
    if (lastInputsSentRef.current === key) return;
    lastInputsSentRef.current = key;
    fn(next);
  }, [area, sandThicknessCm, tape1ThicknessCm, monoBlocksHeightCm, cutBlocks, soilExcessCm, addFrameToMonoblock, framePieceLengthCm, framePieceWidthCm, frameBorderRowCount, frameJointType, frameSidesEnabled, monoblockLayoutMode, monoblockSingleSize, monoblockMixId, monoblockMixEnabledSizes, frameBorderMaterial, isInProjectCreating]);

  useEffect(() => {
    if (!isInProjectCreating || !addFrameToMonoblock || !shape?.closed || !shape.points || shape.points.length < 3) {
      setFrameResults(null);
      return;
    }
    const inputs = {
      ...shape.calculatorInputs,
      addFrameToMonoblock: true,
      framePieceLengthCm: parseFloat(framePieceLengthCm) || 20,
      framePieceWidthCm: parseFloat(framePieceWidthCm) || 10,
      frameBorderRowCount: Math.max(1, Math.min(50, Math.floor(Number(frameBorderRowCount) || 1))),
      frameJointType: frameJointType,
      frameSidesEnabled: frameSidesEnabled,
    };
    const result = computeMonoblockFrameBlocks(shape as any, inputs);
    setFrameResults(result);
  }, [isInProjectCreating, addFrameToMonoblock, framePieceLengthCm, framePieceWidthCm, frameBorderRowCount, frameJointType, frameSidesEnabled, shape?.closed, shape?.calculatorInputs, JSON.stringify(shape?.points)]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [totalHours, setTotalHours] = useState<number | null>(null);
  const [calculationError, setCalculationError] = useState<string | null>(null);
  const [taskBreakdown, setTaskBreakdown] = useState<{task: string, hours: number, amount: number, unit: string}[]>([]);
  const [calculateDigging, setCalculateDigging] = useState<boolean>(false);
  const [selectedExcavator, setSelectedExcavator] = useState<DiggingEquipment | null>(null);
  const [selectedCarrier, setSelectedCarrier] = useState<DiggingEquipment | null>(null);
  const [excavators, setExcavators] = useState<DiggingEquipment[]>([]);
  const [carriers, setCarriers] = useState<DiggingEquipment[]>([]);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [soilTransportDistance, setSoilTransportDistance] = useState<string>('30');
  const [tape1TransportDistance, setTape1TransportDistance] = useState<string>('30');
  const [materialTransportDistance, setMaterialTransportDistance] = useState<string>('30'); // For monoblocks/sand transport
  const [calculateTransport, setCalculateTransport] = useState<boolean>(false);
  const [selectedTransportCarrier, setSelectedTransportCarrier] = useState<DiggingEquipment | null>(null);
  const [selectedCompactor, setSelectedCompactor] = useState<CompactorOption | null>(null);

  // Use props when in ProjectCreating, otherwise local state
  const useTransportProps = isInProjectCreating && propSetCalculateTransport != null;
  const effectiveCalculateTransport = useTransportProps ? (propCalculateTransport ?? false) : calculateTransport;
  const effectiveSetCalculateTransport = useTransportProps ? propSetCalculateTransport! : setCalculateTransport;
  const effectiveSelectedTransportCarrier = useTransportProps ? (propSelectedTransportCarrier ?? null) : selectedTransportCarrier;
  const effectiveSetSelectedTransportCarrier = useTransportProps ? propSetSelectedTransportCarrier! : setSelectedTransportCarrier;
  const effectiveTransportDistance = isInProjectCreating && propTransportDistance != null && propTransportDistance !== '' ? propTransportDistance : materialTransportDistance;
  const effectiveCompactor = isInProjectCreating && propSelectedCompactor ? propSelectedCompactor : selectedCompactor;

  // Fetch task templates for monoblock laying
  const { data: layingTask, isLoading } = useQuery({
    queryKey: ['monoblock_laying_task', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId)
        .eq('name', 'laying monoblocks')
        .single();
      
      if (error) {
        console.error('Error fetching laying task:', error);
        throw error;
      }
      
      if (!data) {
        throw new Error('No task found for laying monoblocks');
      }
      
      return data;
    },
    enabled: !!companyId
  });

  // Fetch all task templates for excavation and tape1 loading
  const { data: taskTemplates = [] } = useQuery({
    queryKey: ['task_templates', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId);
      
      if (error) {
        console.error('Error fetching task templates:', error);
        throw error;
      }
      return data;
    },
    enabled: !!companyId
  });

  // Fetch task template for sand screeding
  const { data: sandScreedingTask } = useQuery({
    queryKey: ['sand_screeding_task', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId)
        .eq('name', 'sand screeding')
        .single();
      if (error) {
        console.error('Error fetching sand screeding task:', error);
        throw error;
      }
      return data;
    },
    enabled: !!companyId
  });

  // Fetch task template for compacting monoblocks
  const { data: compactingMonoblocksTask } = useQuery({
    queryKey: ['compacting_monoblocks_task', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId)
        .eq('name', 'compacting monoblocks m2/h')
        .single();
      if (error) {
        console.error('Error fetching compacting monoblocks task:', error);
        throw error;
      }
      return data;
    },
    enabled: !!companyId
  });

  // Fetch task template for final leveling sand
  const { data: finalLevelingSandTask } = useQuery({
    queryKey: ['final_leveling_sand_task', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId)
        .eq('name', 'final leveling (sand)')
        .single();
      if (error) {
        console.error('Error fetching final leveling sand task:', error);
        throw error;
      }
      return data;
    },
    enabled: !!companyId
  });

    // Fetch material usage configuration for Paving Calculator
    const { data: materialUsageConfig, isLoading: isLoadingConfig } = useQuery<MaterialUsageConfig[]>({
    queryKey: ['materialUsageConfig', 'paving', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('material_usage_configs')
        .select('calculator_id, material_id')
        .eq('calculator_id', 'paving')
        .eq('company_id', companyId);

      if (error) throw error;
      return data as MaterialUsageConfig[];
    },
    enabled: !!companyId
  });

  // Fetch details of the selected sand material
  const selectedSandMaterialId = materialUsageConfig?.[0]?.material_id;

  const { data: selectedSandMaterial, isLoading: isLoadingSelectedSand } = useQuery<Material>({
    queryKey: ['material', selectedSandMaterialId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('materials')
        .select('id, name, unit, price')
        .eq('id', selectedSandMaterialId)
        .single();

      if (error) throw error;
      return data as Material;
    },
    enabled: !!selectedSandMaterialId
  });

  // Query for tape1 preparation tasks - REMOVED, using exact template names from taskTemplates
  // Query for soil excavation tasks - REMOVED, using exact template names from taskTemplates

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
      
      const priceMap = (data || []).reduce((acc: Record<string, number>, item: { name: string; price: number }) => {
        acc[item.name] = item.price;
        return acc;
      }, {} as Record<string, number>);
      
      return materials.map(material => ({
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

  // Add equipment fetching
  useEffect(() => {
    const fetchEquipment = async () => {
      try {
        // Fetch excavators
        const { data: excavatorData, error: excavatorError } = await supabase
          .from('setup_digging')
          .select('*')
          .eq('type', 'excavator')
          .eq('company_id', companyId);
        
        if (excavatorError) throw excavatorError;
        
        // Fetch carriers
        const { data: carrierData, error: carrierError } = await supabase
          .from('setup_digging')
          .select('*')
          .eq('type', 'barrows_dumpers')
          .eq('company_id', companyId);
        
        if (carrierError) throw carrierError;
        
        setExcavators(excavatorData || []);
        setCarriers(carrierData || []);
      } catch (error) {
        console.error('Error fetching equipment:', error);
      }
    };
    
    if (calculateDigging || (isInProjectCreating && propSelectedExcavator)) {
      fetchEquipment();
    }
  }, [calculateDigging, isInProjectCreating, propSelectedExcavator]);

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

  // Helper function to calculate material transport time
  const calculateMaterialTransportTime = (
    materialAmount: number,
    carrierSize: number,
    materialType: string,
    transportDistanceMeters: number
  ) => {
    // Get carrier speed
    const carrierSpeedData = carrierSpeeds.find(c => c.size === carrierSize);
    const carrierSpeed = carrierSpeedData?.speed || DEFAULT_CARRIER_SPEED_M_PER_H;

    // Get material capacity
    const materialCapacityUnits = getMaterialCapacity(materialType, carrierSize);

    // Calculate number of trips
    const trips = Math.ceil(materialAmount / materialCapacityUnits);

    // Calculate time per trip (round trip: distance * 2)
    const timePerTrip = (transportDistanceMeters * 2) / carrierSpeed; // in hours

    // Total transport time
    const totalTransportTime = trips * timePerTrip;

    // Normalize to 30m baseline for statistics
    const normalizedTransportTime = (totalTransportTime * 30) / transportDistanceMeters;

    return {
      trips,
      totalTransportTime,
      normalizedTransportTime
    };
  };

  const calculate = async () => {
    if (!area || !sandThicknessCm || !tape1ThicknessCm || !monoBlocksHeightCm) {
      setCalculationError(t('calculator:fill_all_required_fields'));
      return;
    }

    setCalculationError(null);

    try {
      const areaNum = parseFloat(area);
      const sandThicknessM = parseFloat(sandThicknessCm) / 100;
      const tape1ThicknessM = parseFloat(tape1ThicknessCm) / 100;
      const monoBlocksHeightM = parseFloat(monoBlocksHeightCm) / 100;
      const soilExcessM = soilExcessCm ? parseFloat(soilExcessCm) / 100 : 0;
      const cutBlocksNum = cutBlocks ? parseInt(cutBlocks) : 0;
      const frameAngleCuts = addFrameToMonoblock && frameResults?.frameAngleCuts ? frameResults.frameAngleCuts : 0;
      const frameAreaM2 = addFrameToMonoblock && frameResults ? frameResults.totalFrameAreaM2 : 0;
      const effectiveAreaM2 = areaNum - frameAreaM2;

      // Calculate base hours needed for installation (fallback if DB dynamic estimate is null)
      const layingHoursPerM2 =
        layingTask != null &&
        typeof layingTask.estimated_hours === 'number' &&
        Number.isFinite(layingTask.estimated_hours)
          ? layingTask.estimated_hours
          : DEFAULT_LAYING_MONOBLOCKS_H_PER_M2;
      if (
        layingTask != null &&
        (layingTask.estimated_hours == null || !Number.isFinite(Number(layingTask.estimated_hours))) &&
        !isLoading
      ) {
        console.warn('Laying monoblocks task has no estimated_hours; using fallback rate (m²/h):', DEFAULT_LAYING_MONOBLOCKS_H_PER_M2);
      }

      let mainTaskHours = 0;
      let frameTaskHours = 0;
      const frameUsesSlabRate = frameBorderMaterial === 'slab';

      mainTaskHours = effectiveAreaM2 * layingHoursPerM2;
      if (addFrameToMonoblock && frameResults && frameResults.totalFrameAreaM2 > 0) {
        if (frameUsesSlabRate) {
          frameTaskHours = frameResults.totalFrameAreaM2 * layingHoursPerM2;
        } else {
          frameTaskHours = frameResults.totalFrameBlocks / COBBLE_FRAME_LAYING_BLOCKS_PER_HOUR;
        }
      }

      // Add time for cuts. Use cutting blocks task if available, else 2 min per cut. Include frame corner cuts when miter45.
      // When in project mode with canvasCutGroups, use cut operations count (1 per diagonal/curved, 2 per corner) instead of block count
      const cuttingBlocksTask = (taskTemplates as any[])?.find((t: any) => (t.name || '').toLowerCase().includes('cutting') && (t.name || '').toLowerCase().includes('block'));
      const hoursPerCut = cuttingBlocksTask?.estimated_hours ?? (2 / 60);
      let cuttingHours = 0;
      if (isInProjectCreating && canvasCutGroups.length > 0) {
        const cutOpsCount = canvasCutGroups.reduce((sum, g) => sum + g.count, 0);
        cuttingHours = (cutOpsCount + frameAngleCuts) * hoursPerCut;
      } else {
        cuttingHours = (cutBlocksNum + frameAngleCuts) * hoursPerCut;
      }

      // Calculate materials needed
      const totalDepthM = sandThicknessM + tape1ThicknessM + monoBlocksHeightM + soilExcessM;

      // Calculate soil to be excavated (area × total depth)
      const soilVolume = areaNum * totalDepthM;
      const soilTonnes = soilVolume * 1.5; // 1.5 tonnes per cubic meter

      // Calculate sand needed (area × sand thickness)
      const sandVolume = areaNum * sandThicknessM;
      const sandTonnes = sandVolume * 1.6; // 1.6 tonnes per cubic meter

      // Calculate Type 1 needed (area × Type 1 thickness)
      const tape1Volume = areaNum * tape1ThicknessM;
      const tape1Tonnes = tape1Volume * 2.1; // 2.1 tonnes per cubic meter

      // Get transport distance in meters (from project card when in project mode)
      const transportDistanceMeters = parseFloat(effectiveTransportDistance) || 30;

      // Calculate material transport times if "Calculate transport time" is checked
      let monoBlockTransportTime = 0;
      let sandTransportTime = 0;
      let normalizedMonoBlockTransportTime = 0;
      let normalizedSandTransportTime = 0;

      if (effectiveCalculateTransport) {
        // Use selected transport carrier or default to wheelbarrow 0.125t
        let carrierSizeForTransport = 0.125; // Default wheelbarrow
        
        if (effectiveSelectedTransportCarrier) {
          carrierSizeForTransport = effectiveSelectedTransportCarrier["size (in tones)"] || 0.125;
        }

        // Calculate monoblock transport (assuming ~20kg per piece, so pieces = tonnes * 50)
        const monoBlockPieces = areaNum * 50; // Approximate pieces
        if (monoBlockPieces > 0) {
          const monoResult = calculateMaterialTransportTime(monoBlockPieces, carrierSizeForTransport, 'monoblocks', transportDistanceMeters);
          monoBlockTransportTime = monoResult.totalTransportTime;
          normalizedMonoBlockTransportTime = monoResult.normalizedTransportTime;
        }

        // Calculate sand transport
        if (sandTonnes > 0) {
          const sandResult = calculateMaterialTransportTime(sandTonnes, carrierSizeForTransport, 'sand', transportDistanceMeters);
          sandTransportTime = sandResult.totalTransportTime;
          normalizedSandTransportTime = sandResult.normalizedTransportTime;
        }
      }

      // Calculate compacting time if compactor is selected
      let compactingTimeTotal = 0;
      let compactingLayers = 0;
      let compactingCompactorName = '';

      if (effectiveCompactor && (sandThicknessCm || tape1ThicknessCm)) {
        // In Paving Calculator, compact both sand and type1 layers (sum of both thicknesses)
        const sandDepthCm = parseFloat(sandThicknessCm || '0');
        const tape1DepthCm = parseFloat(tape1ThicknessCm || '0');
        const totalCompactingDepthCm = sandDepthCm + tape1DepthCm;
        
        if (totalCompactingDepthCm > 0) {
          // Use sand material type as the primary type (both materials need compacting)
          const materialType = 'sand';
          
          const compactingCalc = calculateCompactingTime(effectiveCompactor, totalCompactingDepthCm, materialType);
          compactingTimeTotal = areaNum * compactingCalc.timePerM2 * compactingCalc.totalPasses;
          compactingLayers = compactingCalc.numberOfLayers;
          compactingCompactorName = compactingCalc.compactorTaskName;
        }
      }

      // Create task breakdown
      const breakdown = [
        { 
          task: 'laying monoblocks',
          hours: mainTaskHours,
          amount: effectiveAreaM2 ? `${effectiveAreaM2.toFixed(2)} square meters` : '0',
          unit: effectiveAreaM2 ? 'square meters' : 'EMPTY'
        }
      ];
      if (addFrameToMonoblock && frameResults && frameResults.totalFrameBlocks > 0) {
        breakdown.push({
          task: frameUsesSlabRate ? 'laying monoblocks (frame)' : 'laying frame cobbles (60/h)',
          hours: frameTaskHours,
          amount: frameUsesSlabRate
            ? `${frameResults.totalFrameAreaM2.toFixed(2)} square meters`
            : `${frameResults.totalFrameBlocks} blocks`,
          unit: frameUsesSlabRate ? 'square meters' : 'blocks'
        });
      }

      // Add monoblock transport if applicable (default wheelbarrow 0.125 t when no carrier selected)
      if (effectiveCalculateTransport && monoBlockTransportTime > 0) {
        breakdown.push({
          task: 'transport monoblocks',
          hours: monoBlockTransportTime,
          amount: `${(areaNum * 50).toFixed(0)} pieces`,
          unit: 'pieces',
          normalizedHours: normalizedMonoBlockTransportTime
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

      // Add sand screeding task if available
      if (sandScreedingTask && sandScreedingTask.estimated_hours !== undefined) {
        breakdown.push({
          task: 'sand screeding',
          hours: areaNum * sandScreedingTask.estimated_hours,
          amount: areaNum ? `${areaNum} square meters` : '0',
          unit: areaNum ? 'square meters' : 'EMPTY'
        });
      }

      // Add compacting monoblocks task if available
      if (compactingMonoblocksTask && compactingMonoblocksTask.estimated_hours !== undefined) {
        breakdown.push({
          task: 'compacting monoblocks',
          hours: areaNum * compactingMonoblocksTask.estimated_hours,
          amount: areaNum ? `${areaNum} square meters` : '0',
          unit: areaNum ? 'square meters' : 'EMPTY',
          event_task_id: compactingMonoblocksTask.id
        });
      }

      // Add final leveling sand task if available
      if (finalLevelingSandTask && finalLevelingSandTask.estimated_hours !== undefined) {
        breakdown.push({
          task: 'final leveling (sand)',
          hours: areaNum * finalLevelingSandTask.estimated_hours,
          amount: areaNum ? `${areaNum} square meters` : '0',
          unit: areaNum ? 'square meters' : 'EMPTY',
          event_task_id: finalLevelingSandTask.id
        });
      }

      const cuttingAmount = isInProjectCreating && canvasCutGroups.length > 0
        ? canvasCutGroups.reduce((sum, g) => sum + g.count, 0) + frameAngleCuts
        : cutBlocksNum + frameAngleCuts;
      if (cuttingAmount > 0) {
        breakdown.push({ 
          task: `(${cuttingAmount}) cutting blocks`,
          hours: cuttingHours,
          amount: cuttingAmount,
          unit: 'cuts',
          event_task_id: cuttingBlocksTask?.id
        });
      }

      // Add compacting task if applicable
      if (compactingTimeTotal > 0 && compactingCompactorName) {
        breakdown.push({
          task: compactingCompactorName,
          hours: compactingTimeTotal,
          amount: `${areaNum} square meters`,
          unit: 'square meters',
          layers: compactingLayers
        });
      }

      // Calculate digging and preparation time if enabled
      let excavationTime = 0;
      let transportTime = 0;

      // Determine which excavator to use
      const activeExcavator = isInProjectCreating && propSelectedExcavator ? propSelectedExcavator : selectedExcavator;

      if ((calculateDigging || isInProjectCreating) && activeExcavator) {
        const excavatorSize = activeExcavator["size (in tones)"] || 0;
        const excavatorName = activeExcavator.name || '';

        // Add soil excavation time using NEW SYSTEM - exact template name matching
        let soilExcavationTime = 0;
        
        const soilExcavationTemplate = taskTemplates.find((template: any) => {
          const name = (template.name || '').toLowerCase();
          return name.includes('excavation soil') && 
                 name.includes(excavatorName.toLowerCase()) &&
                 name.includes(`(${excavatorSize}t)`);
        });

        if (soilExcavationTemplate && soilExcavationTemplate.estimated_hours) {
          soilExcavationTime = soilExcavationTemplate.estimated_hours * soilTonnes;
        } else {
          console.warn('Soil excavation template not found for:', `Excavation soil with ${excavatorName} (${excavatorSize}t)`);
          soilExcavationTime = 0;
        }

        // Add tape1 loading time using NEW SYSTEM - exact template name matching
        let tape1LoadingTime = 0;
        if (tape1ThicknessCm && parseFloat(tape1ThicknessCm) > 0) {
          const tape1Tonnes = tape1Volume * 2.1;
          
          const tape1Template = taskTemplates.find((template: any) => {
            const name = (template.name || '').toLowerCase();
            return name.includes('loading tape1') && 
                   name.includes(excavatorName.toLowerCase()) &&
                   name.includes(`(${excavatorSize}t)`);
          });

          if (tape1Template && tape1Template.estimated_hours) {
            tape1LoadingTime = tape1Template.estimated_hours * tape1Tonnes;
          } else {
            console.warn('Tape1 loading template not found for:', `Loading tape1 with ${excavatorName} (${excavatorSize}t)`);
            tape1LoadingTime = 0;
          }
        }

        // Add digging tasks to breakdown
        breakdown.unshift(
          { 
            task: 'Soil Excavation',
            hours: soilExcavationTime,
            amount: `${soilTonnes.toFixed(2)} tonnes`,
            unit: 'tonnes'
          }
        );

        if (tape1LoadingTime > 0) {
          breakdown.unshift({
            task: 'Loading tape1',
            hours: tape1LoadingTime,
            amount: `${tape1Tonnes.toFixed(2)} tonnes`,
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
          breakdown.unshift({
            task: 'Loading sand',
            hours: loadingSandTime,
            amount: `${sandTonnes.toFixed(2)} tonnes`,
            unit: 'tonnes'
          });
        }

        // Add transport tasks for soil and tape1 if carrier is selected and distance > 0
        if (selectedCarrier && selectedCarrier.speed_m_per_hour) {
          const soilDistanceMeters = parseFloat(soilTransportDistance) || 0;
          const tape1DistanceMeters = parseFloat(tape1TransportDistance) || 0;
          
          // Calculate soil transport
          if (soilDistanceMeters > 0 && soilTonnes > 0) {
            const soilCapacity = getMaterialCapacity('soil', selectedCarrier["size (in tones)"] || 0);
            const soilTrips = Math.ceil(soilTonnes / soilCapacity);
            const soilTransportTime = (soilTrips * soilDistanceMeters * 2) / selectedCarrier.speed_m_per_hour;
            
            breakdown.unshift({
              task: `Transporting soil (${soilDistanceMeters}m)`,
              hours: soilTransportTime,
              amount: `${soilTonnes.toFixed(2)} tonnes`,
              unit: 'tonnes'
            });
          }
          
          // Calculate tape1 transport
          if (tape1DistanceMeters > 0 && tape1Tonnes > 0) {
            const tape1Capacity = getMaterialCapacity('tape1', selectedCarrier["size (in tones)"] || 0);
            const tape1Trips = Math.ceil(tape1Tonnes / tape1Capacity);
            const tape1TransportTime = (tape1Trips * tape1DistanceMeters * 2) / selectedCarrier.speed_m_per_hour;
            
            breakdown.unshift({
              task: `Transporting tape1 (${tape1DistanceMeters}m)`,
              hours: tape1TransportTime,
              amount: `${tape1Tonnes.toFixed(2)} tonnes`,
              unit: 'tonnes'
            });
          }
        }
      }

      // Calculate total hours
      const totalHours = breakdown.reduce((sum, item) => sum + item.hours, 0);

      // Monoblocks material in m² (from canvas full+cut or from area)
      const blockWidthCm = Number(savedInputs?.blockWidthCm ?? 20);
      const blockLengthCm = Number(savedInputs?.blockLengthCm ?? 10);
      const blockAreaM2 = (blockWidthCm / 100) * (blockLengthCm / 100);
      const layoutModeMat: MonoblockLayoutMode =
        savedInputs?.monoblockLayoutMode === 'mix' ? 'mix' : 'single';
      const mixForMat = getMonoblockMixById(String(savedInputs?.monoblockMixId ?? ''));
      const mixEnabledMap = savedInputs?.monoblockMixEnabledSizes as Partial<Record<MonoblockMixPieceKey, boolean>> | undefined;
      const mergedMixEnabled = { ...defaultMonoblockMixEnabled(), ...mixEnabledMap };
      const enabledMixPieces = mixForMat.pieces.filter((p) => mergedMixEnabled[p.key] !== false);
      const mixLabel =
        layoutModeMat === 'mix' && enabledMixPieces.length > 0
          ? enabledMixPieces.map((p) => `${p.lengthCm}×${p.widthCm}`).join(' + ')
          : '';
      const fromCanvas = isInProjectCreating && (savedInputs?.vizFullBlockCount != null || savedInputs?.cutBlocks != null);
      const fullCount = fromCanvas ? (savedInputs?.vizFullBlockCount ?? 0) : 0;
      const cutCount = fromCanvas ? (parseInt(String(savedInputs?.cutBlocks ?? 0), 10) || 0) : cutBlocksNum;
      const wasteSatisfiedCount = Array.isArray(savedInputs?.vizWasteSatisfied) ? savedInputs.vizWasteSatisfied.length : 0;
      const blocksForCuts = Math.max(0, cutCount - wasteSatisfiedCount);
      const blocksToBuy = fromCanvas && (fullCount > 0 || cutCount > 0) ? fullCount + blocksForCuts : 0;
      const monoblocksMaterialM2 =
        fromCanvas && blocksToBuy > 0
          ? layoutModeMat === 'mix'
            ? effectiveAreaM2
            : blocksToBuy * blockAreaM2
          : effectiveAreaM2;
      const monoblocksMaterialName =
        layoutModeMat === 'mix' && mixLabel
          ? `${t('calculator:monoblocks_mix_material_prefix')} (${mixLabel})`
          : `Monoblocks ${blockWidthCm}×${blockLengthCm}`;

      // Prepare materials list (Monoblocks first, then others)
      const materialsList: Material[] = [
        { name: monoblocksMaterialName, amount: Number(monoblocksMaterialM2.toFixed(2)), unit: 'm²', price_per_unit: null, total_price: null },
        { name: 'Soil excavation', amount: Number(soilTonnes.toFixed(2)), unit: 'tonnes', price_per_unit: null, total_price: null },
        { name: selectedSandMaterial?.name || 'Sand', amount: Number(sandTonnes.toFixed(2)), unit: 'tonnes', price_per_unit: selectedSandMaterial?.price || null, total_price: null },
        { name: 'tape1', amount: Number(tape1Tonnes.toFixed(2)), unit: 'tonnes', price_per_unit: null, total_price: null }
      ];
      if (fillTonnes > 0) {
        const fillLabel = levelingMaterial === 'soil' ? 'Fill (Soil)' : 'Fill (Tape1)';
        materialsList.unshift({ name: fillLabel, amount: Number(fillTonnes.toFixed(2)), unit: 'tonnes', price_per_unit: null, total_price: null });
      }
      if (addFrameToMonoblock && frameResults && frameResults.totalFrameBlocks > 0) {
        materialsList.push({ name: `Frame pieces ${framePieceLengthCm}×${framePieceWidthCm}`, amount: frameResults.totalFrameBlocks, unit: 'blocks', price_per_unit: null, total_price: null });
      }

      // Fetch prices and update state
      const materialsWithPrices = await fetchMaterialPrices(materialsList);
      
      setMaterials(materialsWithPrices);
      setTotalHours(totalHours);
      setTaskBreakdown(breakdown);
    } catch (error) {
      console.error('Calculation error:', error);
      setCalculationError(t('calculator:calculation_error'));
    }
  };

  // Recalculate when project settings (transport, equipment) change
  useEffect(() => {
    if (recalculateTrigger > 0 && isInProjectCreating) {
      void calculate();
    }
  }, [recalculateTrigger]);

  // Add useEffect to notify parent of result changes
  useEffect(() => {
    if (totalHours !== null && materials.length > 0) {
      const formattedResults = {
        name: 'Paving Installation',
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
  }, [totalHours, materials, taskBreakdown, area]);

  // Scroll to results when they appear
  useEffect(() => {
    if (materials.length > 0 && resultsRef.current) {
      setTimeout(() => {
        const modalContainer = resultsRef.current?.closest('[data-calculator-results]');
        if (modalContainer) {
          modalContainer.scrollTop = resultsRef.current.offsetTop - 100;
        } else {
          resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [materials]);

  return (
    <div style={{ fontFamily: fonts.body, display: 'flex', flexDirection: 'column', gap: spacing["6xl"] }}>
      <Card padding={`${spacing["6xl"]}px ${spacing["6xl"]}px ${spacing.md}px`} style={{ marginBottom: spacing["5xl"] }}>
        <CalculatorInputGrid columns={2}>
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
            label={t('calculator:input_sand_thickness_cm')}
            value={sandThicknessCm}
            onChange={setSandThicknessCm}
            placeholder={t('calculator:placeholder_enter_thickness')}
            unit="cm"
          />
          <TextInput
            label={t('calculator:input_monoblock_height_cm')}
            value={monoBlocksHeightCm}
            onChange={setMonoBlocksHeightCm}
            placeholder={t('calculator:placeholder_enter_thickness')}
            unit="cm"
          />
        </CalculatorInputGrid>

        {isInProjectCreating && !compactForPath && (
          <div
            style={{
              marginTop: spacing.md,
              padding: spacing.lg,
              border: `1px solid ${colors.borderLight}`,
              borderRadius: radii.lg,
              background: colors.bgSubtle,
            }}
          >
            <Label>{t('calculator:monoblock_size_mode')}</Label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm, marginTop: spacing.sm }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: spacing.md, cursor: 'pointer', fontSize: fontSizes.base, color: colors.textSecondary }}>
                <input
                  type="radio"
                  name="monoblock-layout-mode"
                  checked={monoblockLayoutMode === 'single' && monoblockSingleSize === '20x10'}
                  onChange={() => {
                    setMonoblockLayoutMode('single');
                    setMonoblockSingleSize('20x10');
                  }}
                />
                {t('calculator:monoblock_single_20x10')}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: spacing.md, cursor: 'pointer', fontSize: fontSizes.base, color: colors.textSecondary }}>
                <input
                  type="radio"
                  name="monoblock-layout-mode"
                  checked={monoblockLayoutMode === 'single' && monoblockSingleSize === '10x10'}
                  onChange={() => {
                    setMonoblockLayoutMode('single');
                    setMonoblockSingleSize('10x10');
                  }}
                />
                {t('calculator:monoblock_single_10x10')}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: spacing.md, cursor: 'pointer', fontSize: fontSizes.base, color: colors.textSecondary }}>
                <input
                  type="radio"
                  name="monoblock-layout-mode"
                  checked={monoblockLayoutMode === 'mix'}
                  onChange={() => {
                    setMonoblockLayoutMode('mix');
                    setMonoblockMixEnabledSizes((prev) => ({ ...defaultMonoblockMixEnabled(), ...prev }));
                  }}
                />
                {t('calculator:monoblock_mode_mix')}
              </label>
            </div>

            {monoblockLayoutMode === 'mix' && (
              <div style={{ marginTop: spacing.lg }}>
                <Label>{t('calculator:monoblock_mix_choose')}</Label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm, marginTop: spacing.sm }}>
                  {MONOBLOCK_MIXES.map((m) => (
                    <label
                      key={m.id}
                      style={{ display: 'flex', alignItems: 'center', gap: spacing.md, cursor: 'pointer', fontSize: fontSizes.base, color: colors.textSecondary }}
                    >
                      <input
                        type="radio"
                        name="monoblock-mix-id"
                        checked={monoblockMixId === m.id}
                        onChange={() => {
                          setMonoblockMixId(m.id);
                          setMonoblockMixEnabledSizes(defaultMonoblockMixEnabled());
                        }}
                      />
                      {t(m.labelKey)}
                    </label>
                  ))}
                </div>
                <div style={{ marginTop: spacing.md }}>
                  <Label>{t('calculator:monoblock_mix_pieces')}</Label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, marginTop: spacing.sm }}>
                    {getMonoblockMixById(monoblockMixId).pieces.map((p) => (
                      <Checkbox
                        key={p.key}
                        label={`${p.lengthCm}×${p.widthCm} cm`}
                        checked={monoblockMixEnabledSizes[p.key] !== false}
                        onChange={(checked) =>
                          setMonoblockMixEnabledSizes((prev) => ({ ...prev, [p.key]: checked }))
                        }
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {!compactForPath && !isInProjectCreating && (
          <TextInput
            label={t('calculator:soil_excess_label')}
            value={soilExcessCm}
            onChange={setSoilExcessCm}
            placeholder={t('calculator:enter_additional_soil_depth')}
            unit="cm"
            helperText={t('calculator:additional_soil_depth_desc')}
          />
        )}
        {!isInProjectCreating && !compactForPath && (
          <TextInput
            label={t('calculator:input_number_of_blocks_cut')}
            value={cutBlocks}
            onChange={setCutBlocks}
            placeholder={t('calculator:placeholder_enter_number_cuts')}
          />
        )}

        {isInProjectCreating && (
          <div style={{ borderTop: `1px solid ${colors.borderLight}`, paddingTop: spacing.xl, marginTop: spacing.xs, marginBottom: spacing["3xl"] }}>
            {!compactForPath && (
              <>
                <Checkbox
                  label={t('calculator:add_frame_to_monoblock') || 'Add frame to monoblock'}
                  checked={addFrameToMonoblock}
                  onChange={setAddFrameToMonoblock}
                />
                {addFrameToMonoblock && (
                  <div style={{ marginTop: spacing.md, display: 'flex', flexDirection: 'column', gap: spacing.md }}>
                    <div>
                      <Label>{t('calculator:frame_border_material_label')}</Label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm }}>
                        <button
                          type="button"
                          onClick={() => setFrameBorderMaterial('cobble')}
                          style={{
                            padding: `${spacing.sm}px ${spacing.lg}px`,
                            borderRadius: radii.md,
                            border: `1px solid ${frameBorderMaterial === 'cobble' ? colors.accentBlueBorder : colors.borderDefault}`,
                            background: frameBorderMaterial === 'cobble' ? colors.bgHover : 'transparent',
                            color: colors.textSecondary,
                            cursor: 'pointer',
                            fontSize: fontSizes.sm,
                          }}
                        >
                          {t('calculator:frame_border_material_cobble')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setFrameBorderMaterial('slab')}
                          style={{
                            padding: `${spacing.sm}px ${spacing.lg}px`,
                            borderRadius: radii.md,
                            border: `1px solid ${frameBorderMaterial === 'slab' ? colors.accentBlueBorder : colors.borderDefault}`,
                            background: frameBorderMaterial === 'slab' ? colors.bgHover : 'transparent',
                            color: colors.textSecondary,
                            cursor: 'pointer',
                            fontSize: fontSizes.sm,
                          }}
                        >
                          {t('calculator:frame_border_material_slab')}
                        </button>
                      </div>
                      <div style={{ marginTop: spacing.xs }}>
                        <HelperText>{t('calculator:frame_border_material_hint')}</HelperText>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.lg, alignItems: 'center' }}>
                      <TextInput
                        label={
                          frameBorderMaterial === 'cobble'
                            ? t('calculator:frame_piece_length_cobble_cm')
                            : t('calculator:piece_length_cm_label')
                        }
                        value={framePieceLengthCm}
                        onChange={setFramePieceLengthCm}
                        unit="cm"
                        style={{ marginBottom: 0, maxWidth: 120 }}
                      />
                      <TextInput
                        label={
                          frameBorderMaterial === 'cobble'
                            ? t('calculator:frame_piece_width_cobble_cm')
                            : t('calculator:piece_width_cm_label')
                        }
                        value={framePieceWidthCm}
                        onChange={setFramePieceWidthCm}
                        unit="cm"
                        style={{ marginBottom: 0, maxWidth: 120 }}
                      />
                      <TextInput
                        label={t('calculator:frame_border_row_count_label') || 'Number of border rows'}
                        value={frameBorderRowCount}
                        onChange={setFrameBorderRowCount}
                        unit=""
                        style={{ marginBottom: 0, maxWidth: 100 }}
                      />
                    </div>
                    <SelectDropdown
                      label={t('calculator:frame_joint_type_label')}
                      value={frameJointType === 'miter45' ? t('calculator:frame_joint_miter45') : t('calculator:frame_joint_butt')}
                      options={[t('calculator:frame_joint_butt'), t('calculator:frame_joint_miter45')]}
                      onChange={(val) => setFrameJointType(val === t('calculator:frame_joint_miter45') ? 'miter45' : 'butt')}
                      width="100%"
                      placeholder={t('calculator:frame_joint_butt')}
                    />
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
                  </div>
                )}
              </>
            )}
            {frameResults && addFrameToMonoblock && (
              <div style={{ marginTop: spacing.md, padding: spacing.base, background: colors.bgSubtle, borderRadius: radii.lg, border: `1px solid ${colors.borderDefault}` }}>
                <p style={{ fontSize: fontSizes.base, color: colors.textSecondary, fontFamily: fonts.body }}>
                  <strong>{t('calculator:frame_blocks') || 'Frame blocks'}:</strong> {frameResults.totalFrameBlocks} {t('calculator:blocks') || 'blocks'}
                  <br />
                  <strong>{t('calculator:frame_area') || 'Frame area'}:</strong> {frameResults.totalFrameAreaM2.toFixed(2)} m²
                  {frameResults.frameAngleCuts > 0 && (
                    <>
                      <br />
                      <strong>{t('calculator:frame_angle_cuts') || 'Corner cuts (45°)'}:</strong> {frameResults.frameAngleCuts}
                    </>
                  )}
                </p>
              </div>
            )}
          </div>
        )}

        {!isInProjectCreating && (
          <CompactorSelector 
            selectedCompactor={selectedCompactor}
            onCompactorChange={setSelectedCompactor}
          />
        )}

        {!isInProjectCreating && (
          <>
            <Checkbox label={t('calculator:calculate_digging_prep')} checked={calculateDigging} onChange={setCalculateDigging} />
            <Checkbox label={t('calculator:calculate_transport_time_label')} checked={effectiveCalculateTransport} onChange={effectiveSetCalculateTransport} />
          </>
        )}

        {/* Equipment Selection */}
        {calculateDigging && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing["6xl"] }}>
            <div>
              <Label>{t('calculator:excavation_machinery')}</Label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md, marginTop: spacing.sm }}>
                {excavators.length === 0 ? (
                  <p style={{ fontSize: fontSizes.base, color: colors.textDim }}>{t('calculator:no_excavators_found')}</p>
                ) : (
                  excavators.map((excavator) => (
                    <div
                      key={excavator.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: spacing.md,
                        cursor: 'pointer',
                        borderRadius: radii.lg,
                        background: selectedExcavator?.id === excavator.id ? colors.bgHover : 'transparent',
                      }}
                      onClick={() => setSelectedExcavator(excavator)}
                    >
                      <div style={{
                        width: 16,
                        height: 16,
                        borderRadius: radii.full,
                        border: `2px solid ${colors.borderMedium}`,
                        marginRight: spacing.md,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        {selectedExcavator?.id === excavator.id && (
                          <div style={{ width: 8, height: 8, borderRadius: radii.full, background: colors.textSubtle }} />
                        )}
                      </div>
                      <div>
                        <span style={{ fontSize: fontSizes.base, color: colors.textSecondary }}>{excavator.name}</span>
                        <span style={{ fontSize: fontSizes.sm, color: colors.textDim, marginLeft: spacing.md }}>({excavator["size (in tones)"]} tons)</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div>
              <Label>{t('calculator:carrier_machinery')}</Label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md, marginTop: spacing.sm }}>
                {carriers.length === 0 ? (
                  <p style={{ fontSize: fontSizes.base, color: colors.textDim }}>{t('calculator:no_carriers_found')}</p>
                ) : (
                  carriers.map((carrier) => (
                    <div
                      key={carrier.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: spacing.md,
                        cursor: 'pointer',
                        borderRadius: radii.lg,
                        background: selectedCarrier?.id === carrier.id ? colors.bgHover : 'transparent',
                      }}
                      onClick={() => setSelectedCarrier(carrier)}
                    >
                      <div style={{
                        width: 16,
                        height: 16,
                        borderRadius: radii.full,
                        border: `2px solid ${colors.borderMedium}`,
                        marginRight: spacing.md,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        {selectedCarrier?.id === carrier.id && (
                          <div style={{ width: 8, height: 8, borderRadius: radii.full, background: colors.textSubtle }} />
                        )}
                      </div>
                      <div>
                        <span style={{ fontSize: fontSizes.base, color: colors.textSecondary }}>{carrier.name}</span>
                        <span style={{ fontSize: fontSizes.sm, color: colors.textDim, marginLeft: spacing.md }}>({carrier["size (in tones)"]} tons)</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {!isInProjectCreating && !compactForPath && calculateDigging && selectedCarrier && (
          <TextInput
            label={t('calculator:transport_distance_label')}
            value={soilTransportDistance}
            onChange={(val) => {
              setSoilTransportDistance(val);
              setTape1TransportDistance(val);
            }}
            placeholder={t('calculator:placeholder_enter_transport_distance')}
            helperText={t('calculator:set_to_zero_no_transporting')}
          />
        )}

        {!isInProjectCreating && effectiveCalculateTransport && (
          <>
            <div>
              <Label>{t('calculator:transport_carrier')}</Label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md, marginTop: spacing.sm }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: spacing.md,
                    cursor: 'pointer',
                    borderRadius: radii.lg,
                    border: `2px dashed ${colors.borderInput}`,
                    background: effectiveSelectedTransportCarrier === null ? colors.bgHover : 'transparent',
                  }}
                  onClick={() => effectiveSetSelectedTransportCarrier(null)}
                >
                  <div style={{
                    width: 16,
                    height: 16,
                    borderRadius: radii.full,
                    border: `2px solid ${colors.borderMedium}`,
                    marginRight: spacing.md,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    {effectiveSelectedTransportCarrier === null && (
                      <div style={{ width: 8, height: 8, borderRadius: radii.full, background: colors.textSubtle }} />
                    )}
                  </div>
                  <span style={{ fontSize: fontSizes.base, color: colors.textSecondary }}>{t('calculator:default_wheelbarrow')}</span>
                </div>
                {(isInProjectCreating ? propCarriers : carriers).length > 0 && (isInProjectCreating ? propCarriers : carriers).map((carrier: DiggingEquipment) => (
                  <div
                    key={carrier.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: spacing.md,
                      cursor: 'pointer',
                      borderRadius: radii.lg,
                      background: effectiveSelectedTransportCarrier?.id === carrier.id ? colors.bgHover : 'transparent',
                    }}
                    onClick={() => effectiveSetSelectedTransportCarrier(carrier)}
                  >
                    <div style={{
                      width: 16,
                      height: 16,
                      borderRadius: radii.full,
                      border: `2px solid ${colors.borderMedium}`,
                      marginRight: spacing.md,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      {effectiveSelectedTransportCarrier?.id === carrier.id && (
                        <div style={{ width: 8, height: 8, borderRadius: radii.full, background: colors.textSubtle }} />
                      )}
                    </div>
                    <div>
                      <span style={{ fontSize: fontSizes.base, color: colors.textSecondary }}>{carrier.name}</span>
                      <span style={{ fontSize: fontSizes.sm, color: colors.textDim, marginLeft: spacing.md }}>({carrier["size (in tones)"]} tons)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <TextInput
              label={t('calculator:transport_distance_label')}
              value={materialTransportDistance}
              onChange={setMaterialTransportDistance}
              placeholder={t('calculator:placeholder_enter_material_transport')}
              helperText={t('calculator:distance_transporting_monoblocks')}
            />
          </>
        )}

        <Button onClick={calculate} variant="primary" fullWidth>
          {t('calculator:calculate_button')}
        </Button>

        {calculationError && (
          <div style={{ padding: spacing.base, background: 'rgba(239,68,68,0.15)', border: `1px solid ${colors.red}`, borderRadius: radii.lg, color: colors.textPrimary, marginTop: spacing.xl }}>
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
    </div>
  );
};

export default PavingCalculator;
