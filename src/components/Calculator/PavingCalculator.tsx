import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { carrierSpeeds, getMaterialCapacity } from '../../constants/materialCapacity';
import { translateTaskName, translateUnit } from '../../lib/translationMap';
import { CompactorSelector, type CompactorOption } from './CompactorSelector';
import { calculateCompactingTime } from '../../lib/compactingCalculations';
import { computeCobblestoneCuts, computeMonoblockFrameBlocks } from '../../projectmanagement/canvacreator/visualization/cobblestonePattern';
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
  const [framePieceLengthCm, setFramePieceLengthCm] = useState<string>(savedInputs?.framePieceLengthCm ?? '60');
  const [framePieceWidthCm, setFramePieceWidthCm] = useState<string>(savedInputs?.framePieceWidthCm ?? '10');
  const [frameJointType, setFrameJointType] = useState<'butt' | 'miter45'>(savedInputs?.frameJointType ?? 'butt');
  useEffect(() => {
    if (savedInputs?.addFrameToMonoblock !== undefined) setAddFrameToMonoblock(!!savedInputs.addFrameToMonoblock);
    if (savedInputs?.framePieceLengthCm != null) setFramePieceLengthCm(String(savedInputs.framePieceLengthCm));
    if (savedInputs?.framePieceWidthCm != null) setFramePieceWidthCm(String(savedInputs.framePieceWidthCm));
    if (savedInputs?.frameJointType === 'butt' || savedInputs?.frameJointType === 'miter45') setFrameJointType(savedInputs.frameJointType);
  }, [savedInputs?.addFrameToMonoblock, savedInputs?.framePieceLengthCm, savedInputs?.framePieceWidthCm, savedInputs?.frameJointType]);

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

  useEffect(() => {
    if (!isInProjectCreating || !shape?.calculatorInputs || !shape.closed || shape.points.length < 3) return;
    const inputs = { ...shape.calculatorInputs, blockWidthCm: shape.calculatorInputs?.blockWidthCm ?? 20, blockLengthCm: shape.calculatorInputs?.blockLengthCm ?? 10, jointGapMm: shape.calculatorInputs?.jointGapMm ?? 1 };
    const { cutBlockCount, wasteSatisfiedPositions } = computeCobblestoneCuts(shape as any, inputs);
    setCutBlocks(String(cutBlockCount));
    if (onInputsChange) {
      const next = wasteSatisfiedPositions ?? [];
      const prev = shape.calculatorInputs?.vizWasteSatisfied ?? [];
      if (JSON.stringify(prev) !== JSON.stringify(next)) {
        onInputsChange({ vizWasteSatisfied: next });
      }
    }
  }, [isInProjectCreating, shape?.calculatorInputs?.blockWidthCm, shape?.calculatorInputs?.blockLengthCm, shape?.calculatorInputs?.jointGapMm, shape?.calculatorInputs?.vizPattern, shape?.calculatorInputs?.vizDirection, shape?.calculatorInputs?.vizStartCorner, shape?.calculatorInputs?.vizOriginOffsetX, shape?.calculatorInputs?.vizOriginOffsetY, shape?.calculatorInputs?.addFrameToMonoblock, shape?.calculatorInputs?.framePieceWidthCm, JSON.stringify(shape?.points), shape?.closed, onInputsChange]);

  const lastInputsSentRef = useRef<string>("");
  useEffect(() => {
    if (!onInputsChange || !isInProjectCreating) return;
    const next = {
      area, sandThicknessCm, tape1ThicknessCm, monoBlocksHeightCm, cutBlocks, soilExcessCm,
      blockWidthCm: 20, blockLengthCm: 10, jointGapMm: 1,
      addFrameToMonoblock: addFrameToMonoblock ? true : undefined,
      framePieceLengthCm: addFrameToMonoblock ? framePieceLengthCm : undefined,
      framePieceWidthCm: addFrameToMonoblock ? framePieceWidthCm : undefined,
      frameJointType: addFrameToMonoblock ? frameJointType : undefined,
    };
    const key = JSON.stringify(next);
    if (lastInputsSentRef.current === key) return;
    lastInputsSentRef.current = key;
    onInputsChange(next);
  }, [area, sandThicknessCm, tape1ThicknessCm, monoBlocksHeightCm, cutBlocks, soilExcessCm, addFrameToMonoblock, framePieceLengthCm, framePieceWidthCm, frameJointType, onInputsChange, isInProjectCreating]);

  useEffect(() => {
    if (!isInProjectCreating || !addFrameToMonoblock || !shape?.closed || !shape.points || shape.points.length < 3) {
      setFrameResults(null);
      return;
    }
    const inputs = {
      ...shape.calculatorInputs,
      addFrameToMonoblock: true,
      framePieceLengthCm: parseFloat(framePieceLengthCm) || 60,
      framePieceWidthCm: parseFloat(framePieceWidthCm) || 10,
      frameJointType: frameJointType,
    };
    const result = computeMonoblockFrameBlocks(shape as any, inputs);
    setFrameResults(result);
  }, [isInProjectCreating, addFrameToMonoblock, framePieceLengthCm, framePieceWidthCm, frameJointType, shape?.closed, shape?.calculatorInputs, JSON.stringify(shape?.points)]);
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
      console.log('Fetching monoblock laying task...');
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
      
      console.log('Fetched laying task:', data);
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
      const materialNames = materials.map(m => m.name);
      
      const { data, error } = await supabase
        .from('materials')
        .select('name, price')
        .in('name', materialNames);
      
      if (error) throw error;
      
      const priceMap = data.reduce((acc, item) => {
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
    
    if (calculateDigging) {
      fetchEquipment();
    }
  }, [calculateDigging]);

  // Define loading sand time estimates (same as preparation digger estimates)
  const loadingSandDiggerTimeEstimates = [
    { equipment: 'Shovel (1 Person)', sizeInTons: 0.02, timePerTon: 0.5 },
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
    const carrierSpeed = carrierSpeedData?.speed || 4000; // Default 4000 m/h

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

      // Calculate base hours needed for installation
      let mainTaskHours = 0;
      let frameTaskHours = 0;
      console.log('Laying task data:', layingTask);
      
      if (layingTask?.unit && layingTask?.estimated_hours !== undefined) {
        console.log(`Task: ${layingTask.name}, Unit: ${layingTask.unit}, Estimated hours: ${layingTask.estimated_hours}`);
        
        mainTaskHours = effectiveAreaM2 * layingTask.estimated_hours;
        if (addFrameToMonoblock && frameResults && frameResults.totalFrameAreaM2 > 0) {
          frameTaskHours = frameResults.totalFrameAreaM2 * layingTask.estimated_hours;
        }
        console.log(`Calculated main task hours: ${effectiveAreaM2} square meters × ${layingTask.estimated_hours} = ${mainTaskHours} hours`);
      } else {
        console.warn('Laying task has no unit or estimated_hours:', layingTask);
      }

      // Add time for cuts. Use cutting blocks task if available, else 2 min per cut. Include frame corner cuts when miter45.
      const cuttingBlocksTask = (taskTemplates as any[])?.find((t: any) => (t.name || '').toLowerCase().includes('cutting') && (t.name || '').toLowerCase().includes('block'));
      const hoursPerCut = cuttingBlocksTask?.estimated_hours ?? (2 / 60);
      const cuttingHours = (cutBlocksNum + frameAngleCuts) * hoursPerCut;

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
          task: 'laying monoblocks (frame)',
          hours: frameTaskHours,
          amount: `${frameResults.totalFrameBlocks} blocks`,
          unit: 'blocks'
        });
      }

      // Add monoblock transport if applicable (use material carrier from project card when in project mode)
      if (effectiveSelectedTransportCarrier && monoBlockTransportTime > 0) {
        breakdown.push({
          task: 'transport monoblocks',
          hours: monoBlockTransportTime,
          amount: `${(areaNum * 50).toFixed(0)} pieces`,
          unit: 'pieces',
          normalizedHours: normalizedMonoBlockTransportTime
        });
      }

      // Add sand transport if applicable (use material carrier from project card when in project mode)
      if (effectiveSelectedTransportCarrier && sandTransportTime > 0) {
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

      if (cutBlocksNum > 0 || frameAngleCuts > 0) {
        breakdown.push({ 
          task: `(${cutBlocksNum + frameAngleCuts}) cutting blocks`,
          hours: cuttingHours,
          amount: cutBlocksNum + frameAngleCuts,
          unit: 'blocks',
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

      if (calculateDigging && activeExcavator) {
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
          console.log('Found soil excavation template:', soilExcavationTemplate.name, 'Time:', soilExcavationTime);
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
            console.log('Found tape1 loading template:', tape1Template.name, 'Time:', tape1LoadingTime);
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

      // Prepare materials list
      const materialsList: Material[] = [
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

      // Notify parent component
      if (onResultsChange) {
        onResultsChange(formattedResults);
      }
    }
  }, [totalHours, materials, taskBreakdown, area, onResultsChange]);

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
        </div>

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
            <Checkbox
              label={t('calculator:add_frame_to_monoblock') || 'Add frame to monoblock'}
              checked={addFrameToMonoblock}
              onChange={setAddFrameToMonoblock}
            />
            {addFrameToMonoblock && (
              <div style={{ marginTop: spacing.md, display: 'flex', flexDirection: 'column', gap: spacing.md }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.lg, alignItems: 'center' }}>
                  <TextInput
                    label={t('calculator:piece_length_cm_label') || 'Each piece length (cm)'}
                    value={framePieceLengthCm}
                    onChange={setFramePieceLengthCm}
                    unit="cm"
                    style={{ marginBottom: 0, maxWidth: 120 }}
                  />
                  <TextInput
                    label={t('calculator:piece_width_cm_label') || 'Each piece width (cm)'}
                    value={framePieceWidthCm}
                    onChange={setFramePieceWidthCm}
                    unit="cm"
                    style={{ marginBottom: 0, maxWidth: 120 }}
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
              </div>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
                {taskBreakdown.map((task: { task: string; hours: number }, index: number) => (
                  <div
                    key={index}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: `${spacing.lg}px ${spacing["2xl"]}px`,
                      background: colors.bgSubtle,
                      borderRadius: radii.lg,
                      border: `1px solid ${colors.borderLight}`,
                    }}
                  >
                    <span style={{ fontSize: fontSizes.base, color: colors.textMuted, fontFamily: fonts.body }}>
                      {translateTaskName(task.task, t)}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: spacing.xs }}>
                      <span style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.bold, color: colors.textSecondary, fontFamily: fonts.display }}>
                        {task.hours.toFixed(2)}
                      </span>
                      <span style={{ fontSize: fontSizes.sm, color: colors.textFaint, fontFamily: fonts.body }}>hrs</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            <DataTable
              columns={[
                { key: 'name', label: 'MATERIAL', width: '2fr' },
                { key: 'quantity', label: 'QUANTITY', width: '1fr' },
                { key: 'unit', label: 'UNIT', width: '1fr' },
                { key: 'price', label: 'PRICE/UNIT', width: '1fr' },
                { key: 'total', label: 'TOTAL', width: '1fr' },
              ]}
              rows={materials.map((m) => ({
                name: <span style={{ fontSize: fontSizes.base, color: colors.textMuted, fontFamily: fonts.body }}>{m.name}</span>,
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
