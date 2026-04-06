import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { carrierSpeeds, getMaterialCapacity, DEFAULT_CARRIER_SPEED_M_PER_H } from '../../constants/materialCapacity';
import { translateTaskName, translateUnit, translateMaterialName } from '../../lib/translationMap';
import { CompactorSelector, type CompactorOption } from './CompactorSelector';
import { calculateCompactingTime } from '../../lib/compactingCalculations';
import { colors, fonts, fontSizes, fontWeights, spacing, radii, gradients } from '../../themes/designTokens';
import { Spinner, Button, Card, DataTable, TextInput, Checkbox } from '../../themes/uiComponents';
import { getEffectiveTotalArea } from '../../projectmanagement/canvacreator/visualization/grassRolls';

interface Material {
  name: string;
  amount: number;
  unit: string;
  price_per_unit: number | null;
  total_price: number | null;
}

interface Shape {
  points: { x: number; y: number }[];
  closed: boolean;
  calculatorInputs?: Record<string, any>;
}

interface ArtificialGrassCalculatorProps {
  onResultsChange?: (results: any) => void;
  onInputsChange?: (inputs: Record<string, any>) => void;
  isInProjectCreating?: boolean;
  initialArea?: number;
  savedInputs?: Record<string, any>;
  shape?: Shape;
  /** When true, hide edge trimming and joint length inputs (used in canvas where they're auto-filled) */
  hideEdgeAndJointInputs?: boolean;
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
}

interface MaterialUsageConfig {
  calculator_id: string;
  material_id: string;
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

const ArtificialGrassCalculator: React.FC<ArtificialGrassCalculatorProps> = ({ 
  onResultsChange, 
  onInputsChange,
  isInProjectCreating = false,
  initialArea,
  savedInputs = {},
  shape,
  hideEdgeAndJointInputs = !!shape,
  calculateTransport: propCalculateTransport,
  setCalculateTransport: propSetCalculateTransport,
  selectedTransportCarrier: propSelectedTransportCarrier,
  setSelectedTransportCarrier: propSetSelectedTransportCarrier,
  transportDistance: propTransportDistance,
  setTransportDistance: propSetTransportDistance,
  carriers: propCarriers = [],
  selectedExcavator: propSelectedExcavator,
  selectedCompactor: propSelectedCompactor,
  recalculateTrigger = 0
}) => {
  const { t } = useTranslation(['calculator', 'utilities', 'common']);
  const companyId = useAuthStore(state => state.getCompanyId());
  const initArea = (savedInputs?.effectiveAreaM2 != null && savedInputs.effectiveAreaM2 > 0)
    ? String(savedInputs.effectiveAreaM2.toFixed(3))
    : (savedInputs?.area != null ? String(savedInputs.area) : (initialArea != null ? initialArea.toFixed(3) : ''));
  const [area, setArea] = useState<string>(initArea);
  useEffect(() => {
    if (savedInputs?.effectiveAreaM2 != null && savedInputs.effectiveAreaM2 > 0) setArea(String(savedInputs.effectiveAreaM2.toFixed(3)));
    else if (savedInputs?.area != null) setArea(String(savedInputs.area));
    else if (initialArea != null && isInProjectCreating) setArea(initialArea.toFixed(3));
  }, [savedInputs?.effectiveAreaM2, savedInputs?.area, initialArea, isInProjectCreating]);
  useEffect(() => {
    if (!hideEdgeAndJointInputs && savedInputs?.jointsLength != null) setJointsLength(String(savedInputs.jointsLength));
    if (!hideEdgeAndJointInputs && savedInputs?.trimLength != null) setTrimLength(String(savedInputs.trimLength));
  }, [savedInputs?.jointsLength, savedInputs?.trimLength, hideEdgeAndJointInputs]);

  useEffect(() => {
    if (savedInputs?.tape1ThicknessCm != null && savedInputs.tape1ThicknessCm !== '') setTape1ThicknessCm(String(savedInputs.tape1ThicknessCm));
    if (savedInputs?.sandThicknessCm != null && savedInputs.sandThicknessCm !== '') setSandThicknessCm(String(savedInputs.sandThicknessCm));
  }, [savedInputs?.tape1ThicknessCm, savedInputs?.sandThicknessCm]);
  useEffect(() => {
    const saved = savedInputs?.grassElements as GrassElement[] | undefined;
    if (Array.isArray(saved) && saved.length > 0) setGrassElements(saved);
  }, [savedInputs?.grassElements]);
  const [tape1ThicknessCm, setTape1ThicknessCm] = useState<string>(savedInputs?.tape1ThicknessCm ?? '');
  const [sandThicknessCm, setSandThicknessCm] = useState<string>(savedInputs?.sandThicknessCm ?? '');
  const [soilExcessCm, setSoilExcessCm] = useState<string>(savedInputs?.soilExcessCm ?? '');
  const [jointsLength, setJointsLength] = useState<string>(savedInputs?.jointsLength ?? '');
  const [trimLength, setTrimLength] = useState<string>(savedInputs?.trimLength ?? '');
  type GrassElement = { widthM: string; lengthM: string };
  const [grassElements, setGrassElements] = useState<GrassElement[]>(() => {
    const saved = savedInputs?.grassElements as GrassElement[] | undefined;
    if (Array.isArray(saved) && saved.length > 0) return saved;
    return [{ widthM: '4', lengthM: '10' }];
  });
  const [materials, setMaterials] = useState<Material[]>([]);
  const [totalHours, setTotalHours] = useState<number | null>(null);
  const [calculationError, setCalculationError] = useState<string | null>(null);
  const [taskBreakdown, setTaskBreakdown] = useState<{task: string, hours: number, amount: string, unit: string}[]>([]);
  useEffect(() => {
    if (onInputsChange && isInProjectCreating) {
      onInputsChange({
        area,
        tape1ThicknessCm,
        sandThicknessCm,
        soilExcessCm,
        grassElements,
        ...(!hideEdgeAndJointInputs && { jointsLength, trimLength }),
      });
    }
  }, [area, tape1ThicknessCm, sandThicknessCm, soilExcessCm, grassElements, jointsLength, trimLength, hideEdgeAndJointInputs, onInputsChange, isInProjectCreating]);
  const [calculateDigging, setCalculateDigging] = useState<boolean>(false);
  const [selectedExcavator, setSelectedExcavator] = useState<DiggingEquipment | null>(null);
  const [selectedCarrier, setSelectedCarrier] = useState<DiggingEquipment | null>(null);
  const [excavators, setExcavators] = useState<DiggingEquipment[]>([]);
  const [carriersLocal, setCarriersLocal] = useState<DiggingEquipment[]>([]);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [soilTransportDistance, setSoilTransportDistance] = useState<string>('30');
  const [tape1TransportDistance, setTape1TransportDistance] = useState<string>('30');
  const [materialTransportDistance, setMaterialTransportDistance] = useState<string>('30'); // For sand transport
  const [calculateTransport, setCalculateTransport] = useState<boolean>(false);
  const [selectedTransportCarrier, setSelectedTransportCarrier] = useState<DiggingEquipment | null>(null);
  const [transportDistance, setTransportDistance] = useState<string>('30'); // Local state for transport distance
  const [selectedCompactor, setSelectedCompactor] = useState<CompactorOption | null>(null);
  const effectiveCompactor = isInProjectCreating && propSelectedCompactor ? propSelectedCompactor : selectedCompactor;
  const effectiveCalculateTransport = isInProjectCreating ? (propCalculateTransport ?? false) : calculateTransport;
  const effectiveSelectedTransportCarrier = isInProjectCreating ? (propSelectedTransportCarrier ?? null) : selectedTransportCarrier;

  // Use carriers from props if available (from ProjectCreating), otherwise use local state
  const carriers = propCarriers && propCarriers.length > 0 ? propCarriers : carriersLocal;

  // Fetch task template for artificial grass laying
  const { data: layingTask, isLoading } = useQuery({
    queryKey: ['artificial_grass_laying_task', companyId || 'no-company'],
    queryFn: async () => {
      if (!companyId) throw new Error('No company ID');
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId)
        .eq('name', 'laying artificial grass')
        .single();
      
      if (error) {
        console.error('Error fetching laying task:', error);
        throw error;
      }
      
      if (!data) {
        throw new Error('No task found for laying artificial grass');
      }
      
      return data;
    },
    enabled: !!companyId
  });

  // Fetch task template for sand screeding
  const { data: sandScreedingTask } = useQuery({
    queryKey: ['sand_screeding_task', companyId || 'no-company'],
    queryFn: async () => {
      if (!companyId) return null;
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

  // Fetch task template for jointing artificial grass
  const { data: jointingTask } = useQuery({
    queryKey: ['jointing_artificial_grass_task', companyId || 'no-company'],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId)
        .eq('name', 'jointing artificial grass')
        .single();
      if (error) {
        console.error('Error fetching jointing artificial grass task:', error);
        throw error;
      }
      return data;
    },
    enabled: !!companyId
  });

  // Fetch task template for trimming edges artificial grass
  const { data: trimmingEdgesTask } = useQuery({
    queryKey: ['trimming_edges_artificial_grass_task', companyId || 'no-company'],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId)
        .eq('name', 'trimming edges (artificial grass)')
        .single();
      if (error) {
        console.error('Error fetching trimming edges artificial grass task:', error);
        throw error;
      }
      return data;
    },
    enabled: !!companyId
  });

  // Fetch task template for final leveling sand
  const { data: finalLevelingSandTask } = useQuery({
    queryKey: ['final_leveling_sand_task', companyId || 'no-company'],
    queryFn: async () => {
      if (!companyId) return null;
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

  // Fetch all task templates for excavation and tape1 loading
  const { data: taskTemplates = [] } = useQuery({
    queryKey: ['task_templates', companyId || 'no-company'],
    queryFn: async () => {
      if (!companyId) return [];
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

  // Fetch material usage configuration for Artificial Grass Calculator
  const { data: materialUsageConfig } = useQuery<MaterialUsageConfig[]>({
    queryKey: ['materialUsageConfig', 'artificial_grass', companyId || 'no-company'],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('material_usage_configs')
        .select('calculator_id, material_id')
        .eq('calculator_id', 'artificial_grass')
        .eq('company_id', companyId);

      if (error) throw error;
      return data as MaterialUsageConfig[];
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
      return data ? { ...data, amount: 0, price_per_unit: data.price || null, total_price: null } : { name: '', amount: 0, unit: '', price_per_unit: null, total_price: null } as Material;
    },
    enabled: !!selectedSandMaterialId && !!companyId
  });

  // Query for soil excavation tasks - REMOVED, using exact template names from taskTemplates
  // Query for tape1 preparation tasks - REMOVED, using exact template names from taskTemplates

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
      
      const priceMap = data.reduce((acc, item) => {
        if (item.price !== null) {
          acc[item.name] = item.price;
        }
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

  // Sync transport props to local state when in ProjectCreating
  useEffect(() => {
    if (isInProjectCreating) {
      if (propCalculateTransport !== undefined) setCalculateTransport(propCalculateTransport);
      if (propSelectedTransportCarrier !== undefined) setSelectedTransportCarrier(propSelectedTransportCarrier);
      if (propTransportDistance !== undefined) {
        setTransportDistance(propTransportDistance);
        setMaterialTransportDistance(propTransportDistance);
      }
    }
  }, [
    isInProjectCreating,
    propCalculateTransport,
    propSelectedTransportCarrier,
    propTransportDistance
  ]);

  // Add equipment fetching
  useEffect(() => {
    const fetchEquipment = async () => {
      try {
        const companyId = useAuthStore.getState().getCompanyId();
        if (!companyId) return;
        
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
        setCarriersLocal(carrierData || []);
      } catch (error) {
        console.error('Error fetching equipment:', error);
      }
    };
    
    if (calculateDigging || calculateTransport || (isInProjectCreating && propSelectedExcavator)) {
      fetchEquipment();
    }
  }, [calculateDigging, calculateTransport, isInProjectCreating, propSelectedExcavator]);

  // Add time estimate functions
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
    const carrierSpeedData = carrierSpeeds.find(c => c.size === carrierSize);
    const carrierSpeed = carrierSpeedData?.speed || DEFAULT_CARRIER_SPEED_M_PER_H;
    const materialCapacityUnits = getMaterialCapacity(materialType, carrierSize);
    const trips = Math.ceil(materialAmount / materialCapacityUnits);
    const timePerTrip = (transportDistanceMeters * 2) / carrierSpeed;
    const totalTransportTime = trips * timePerTrip;
    const normalizedTransportTime = (totalTransportTime * 30) / transportDistanceMeters;
    return { trips, totalTransportTime, normalizedTransportTime };
  };

  const calculate = async () => {
    const fromCanvas = savedInputs?.effectiveAreaM2 != null && savedInputs.effectiveAreaM2 > 0;
    const grassElementsArea = grassElements.reduce((sum, el) => {
      const w = parseFloat(el.widthM || '0');
      const l = parseFloat(el.lengthM || '0');
      return sum + (isNaN(w) || isNaN(l) ? 0 : w * l);
    }, 0);
    const areaForCalc = fromCanvas
      ? savedInputs.effectiveAreaM2
      : grassElementsArea > 0
        ? grassElementsArea
        : parseFloat(area);
    if ((!area || isNaN(parseFloat(area))) && (!savedInputs?.effectiveAreaM2 || savedInputs.effectiveAreaM2 <= 0) && grassElementsArea <= 0) {
      setCalculationError(t('calculator:fill_all_required_fields'));
      return;
    }
    if (!tape1ThicknessCm || !sandThicknessCm) {
      setCalculationError(t('calculator:fill_all_required_fields'));
      return;
    }

    setCalculationError(null);

    try {
      const areaNum = areaForCalc;
      const tape1ThicknessM = parseFloat(tape1ThicknessCm) / 100;
      const sandThicknessM = parseFloat(sandThicknessCm) / 100;
      const soilExcessM = soilExcessCm ? parseFloat(soilExcessCm) / 100 : 0;

      // Calculate base hours needed for installation
      let mainTaskHours = 0;
      
      if (layingTask?.unit && layingTask?.estimated_hours !== undefined && layingTask?.estimated_hours !== null) {
        const unitLower = layingTask.unit.toLowerCase();
        if (unitLower === 'm2' || unitLower === 'square meters') {
          mainTaskHours = areaNum * layingTask.estimated_hours;
        } else {
          console.warn('Task unit is not m2 or square meters:', layingTask.unit);
          mainTaskHours = areaNum * layingTask.estimated_hours;
        }
      } else {
        console.warn('Laying task has no unit or estimated_hours:', layingTask);
      }

      // Calculate materials needed
      const totalDepthM = tape1ThicknessM + sandThicknessM + soilExcessM;

      // Calculate soil to be excavated (area × total depth)
      const soilVolume = areaNum * totalDepthM;
      const soilTonnes = soilVolume * 1.5; // 1.5 tonnes per cubic meter

      // Calculate sand needed (area × sand thickness)
      const sandVolume = areaNum * sandThicknessM;
      const sandTonnes = sandVolume * 1.6; // 1.6 tonnes per cubic meter

      // Calculate Type 1 needed (area × Type 1 thickness)
      const tape1Volume = areaNum * tape1ThicknessM;
      const tape1Tonnes = tape1Volume * 2.1; // Updated to 2.1 tonnes per cubic meter to match AggregateCalculator

      // Get transport distance in meters
      const transportDistanceMeters = parseFloat(materialTransportDistance) || 30;

      // Calculate material transport times if "Calculate transport time" is checked
      let sandTransportTime = 0;
      let normalizedSandTransportTime = 0;

      if (effectiveCalculateTransport) {
        let carrierSizeForTransport = 0.125;
        
        if (effectiveSelectedTransportCarrier) {
          carrierSizeForTransport = effectiveSelectedTransportCarrier["size (in tones)"] || 0.125;
        }

        // Calculate sand transport
        if (sandTonnes > 0) {
          const sandResult = calculateMaterialTransportTime(sandTonnes, carrierSizeForTransport, 'sand', transportDistanceMeters);
          sandTransportTime = sandResult.totalTransportTime;
          normalizedSandTransportTime = sandResult.normalizedTransportTime;
        }
      }

      // Create task breakdown
      const breakdown = [
        { task: 'Laying Artificial Grass', hours: mainTaskHours, amount: areaNum.toString(), unit: 'square meters' }
      ];

      // Add sand screeding task if available
      if (sandScreedingTask && sandScreedingTask.estimated_hours !== undefined && sandScreedingTask.estimated_hours !== null) {
        breakdown.push({
          task: 'sand screeding',
          hours: areaNum * sandScreedingTask.estimated_hours,
          amount: areaNum.toString(),
          unit: 'square meters'
        });
      }

      // Add jointing artificial grass task if available and jointsLength is provided (auto-filled from canvas or manual input)
      const effectiveJointsLength = hideEdgeAndJointInputs ? (savedInputs?.jointsLength ?? '') : (savedInputs?.jointsLength ?? jointsLength);
      const jointsLengthNum = parseFloat(effectiveJointsLength);
      if (jointingTask && jointingTask.estimated_hours !== undefined && jointingTask.estimated_hours !== null && effectiveJointsLength && !isNaN(jointsLengthNum) && jointsLengthNum > 0) {
        breakdown.push({
          task: 'jointing artificial grass',
          hours: jointsLengthNum * jointingTask.estimated_hours,
          amount: jointsLengthNum.toString(),
          unit: 'meters'
        });
      }

      // Add trimming edges artificial grass task if available and trimLength is provided (auto-filled from canvas or manual input)
      const effectiveTrimLength = hideEdgeAndJointInputs ? (savedInputs?.trimLength ?? '') : (savedInputs?.trimLength ?? trimLength);
      const trimLengthNum = parseFloat(effectiveTrimLength);
      if (trimmingEdgesTask && trimmingEdgesTask.estimated_hours !== undefined && trimmingEdgesTask.estimated_hours !== null && effectiveTrimLength && !isNaN(trimLengthNum) && trimLengthNum > 0) {
        breakdown.push({
          task: 'trimming edges (artificial grass)',
          hours: trimLengthNum * trimmingEdgesTask.estimated_hours,
          amount: trimLengthNum.toString(),
          unit: 'meters'
        });
      }

      // Add final leveling sand task if available
      if (finalLevelingSandTask && finalLevelingSandTask.estimated_hours !== undefined && finalLevelingSandTask.estimated_hours !== null) {
        breakdown.push({
          task: 'final leveling (sand)',
          hours: areaNum * finalLevelingSandTask.estimated_hours,
          amount: areaNum.toString(),
          unit: 'square meters'
        });
      }

      // Add transport tasks if applicable
      if (effectiveCalculateTransport && sandTransportTime > 0) {
        breakdown.push({
          task: 'transport sand',
          hours: sandTransportTime,
          amount: sandTonnes.toFixed(2),
          unit: 'tonnes'
        });
      }
      
      // Calculate compacting time if compactor is selected
      let compactingTimeTotal = 0;
      let compactingLayers = 0;
      let compactingCompactorName = '';

      if (effectiveCompactor && (sandThicknessCm || tape1ThicknessCm)) {
        // In Artificial Grass Calculator, compact both sand and type1 layers (sum of both thicknesses)
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

      // Add compacting task if applicable
      if (compactingTimeTotal > 0 && compactingCompactorName) {
        breakdown.push({
          task: compactingCompactorName,
          hours: compactingTimeTotal,
          amount: areaNum.toString(),
          unit: 'square meters'
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
        if (tape1ThicknessM > 0) {
          const tape1Tons = tape1Tonnes;
          
          const tape1Template = taskTemplates.find((template: any) => {
            const name = (template.name || '').toLowerCase();
            return name.includes('loading tape1') && 
                   name.includes(excavatorName.toLowerCase()) &&
                   name.includes(`(${excavatorSize}t)`);
          });

          if (tape1Template && tape1Template.estimated_hours) {
            tape1LoadingTime = tape1Template.estimated_hours * tape1Tons;
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
            amount: soilTonnes.toFixed(2),
            unit: 'tonnes'
          }
        );

        if (tape1LoadingTime > 0) {
          breakdown.unshift({
            task: 'Loading tape1',
            hours: tape1LoadingTime,
            amount: tape1Tonnes.toFixed(2),
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
            amount: sandTonnes.toFixed(2),
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
              amount: soilTonnes.toFixed(2),
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
              amount: tape1Tonnes.toFixed(2),
              unit: 'tonnes'
            });
          }
        }
      }

      // Calculate total hours
      const totalHours = breakdown.reduce((sum, item) => sum + item.hours, 0);

      // Artificial Grass material = roll area (what you buy); other calcs use element area
      const artificialGrassM2 = fromCanvas
        ? ((savedInputs?.artificialGrassAreaM2 ?? 0) > 0
            ? savedInputs.artificialGrassAreaM2
            : (Array.isArray(savedInputs?.vizPieces) && savedInputs.vizPieces.length > 0
                ? getEffectiveTotalArea(savedInputs.vizPieces)
                : areaNum))
        : areaNum;
      // Prepare materials list (Artificial Grass first, then others)
      const materialsList: Material[] = [
        { name: 'Artificial Grass', amount: Number(artificialGrassM2.toFixed(2)), unit: 'm²', price_per_unit: null, total_price: null },
        { name: 'Soil excavation', amount: Number(soilTonnes.toFixed(2)), unit: 'tonnes', price_per_unit: null, total_price: null },
        // Use the name and price of the selected sand material if available, otherwise fallback
        { name: selectedSandMaterial?.name || 'Sand', amount: Number(sandTonnes.toFixed(2)), unit: 'tonnes', price_per_unit: selectedSandMaterial?.price_per_unit || null, total_price: null },
        { name: 'tape1', amount: Number(tape1Tonnes.toFixed(2)), unit: 'tonnes', price_per_unit: null, total_price: null }
      ];

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
        name: 'Artificial Grass Installation',
        amount: parseFloat(area) || 0,
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
        if (modalContainer && resultsRef.current) {
          modalContainer.scrollTop = resultsRef.current.offsetTop - 100;
        } else {
          resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [materials]);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 192 }}>
        <Spinner size={32} />
      </div>
    );
  }

  return (
    <div style={{ fontFamily: fonts.body, display: 'flex', flexDirection: 'column', gap: spacing["6xl"] }}>
      <h2 style={{ fontSize: fontSizes["2xl"], fontWeight: fontWeights.extrabold, color: colors.textPrimary, fontFamily: fonts.display, letterSpacing: '0.3px', margin: `${spacing.md}px 0 ${spacing.sm}px` }}>
        {t('calculator:artificial_grass_installation_calculator_title')}
      </h2>
      <p style={{ fontSize: fontSizes.base, color: colors.textDim, fontFamily: fonts.body, lineHeight: 1.5 }}>
        Calculate materials, time, and costs for artificial grass installation projects.
      </p>
      
      <Card padding={`${spacing["6xl"]}px ${spacing["6xl"]}px ${spacing.md}px`} style={{ marginBottom: spacing["5xl"] }}>
        {!hideEdgeAndJointInputs && (
          <div style={{ marginBottom: spacing.xl }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
              <span style={{ fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted }}>{t('calculator:grass_elements_label')}</span>
              <div style={{ display: 'flex', gap: spacing.sm }}>
                <Button variant="accent" color={colors.accentBlue} onClick={() => setGrassElements(prev => [...prev, { widthM: '4', lengthM: '10' }])}>
                  {t('calculator:grass_add_element')}
                </Button>
              </div>
            </div>
            {grassElements.map((el, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.md }}>
                <span style={{ fontSize: fontSizes.sm, color: colors.textDim, minWidth: 70, paddingTop: 10 }}>{t('calculator:grass_element_n', { n: idx + 1 })}</span>
                <TextInput
                  label=""
                  value={el.widthM}
                  onChange={(v) => setGrassElements(prev => prev.map((e, i) => i === idx ? { ...e, widthM: v } : e))}
                  placeholder="m"
                  unit="m"
                  style={{ flex: 1 }}
                />
                <span style={{ paddingTop: 10, color: colors.textDim }}>×</span>
                <TextInput
                  label=""
                  value={el.lengthM}
                  onChange={(v) => setGrassElements(prev => prev.map((e, i) => i === idx ? { ...e, lengthM: v } : e))}
                  placeholder="m"
                  unit="m"
                  style={{ flex: 1 }}
                />
                <Button
                  variant="secondary"
                  onClick={() => setGrassElements(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)}
                  disabled={grassElements.length <= 1}
                  style={{ marginTop: 4 }}
                >
                  {t('calculator:grass_remove_element')}
                </Button>
              </div>
            ))}
            <div style={{ fontSize: fontSizes.sm, color: colors.textDim, marginTop: spacing.sm }}>
              {t('calculator:grass_total_area')}: {grassElements.reduce((s, el) => s + (parseFloat(el.widthM || '0') * parseFloat(el.lengthM || '0') || 0), 0).toFixed(2)} m²
            </div>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: `0 ${spacing["5xl"]}px` }}>
          <TextInput
            label={t('calculator:input_area_m2')}
            value={area}
            onChange={setArea}
            placeholder={t('calculator:placeholder_enter_area_m2')}
            unit="m²"
          />
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
        </div>

        {!hideEdgeAndJointInputs && (
          <>
            <TextInput
              label={t('calculator:input_additional_soil_depth_cm')}
              value={soilExcessCm}
              onChange={setSoilExcessCm}
              placeholder={t('calculator:placeholder_enter_depth_cm')}
              unit="cm"
              helperText={t('calculator:additional_soil_depth_desc')}
            />
            <TextInput
              label={t('calculator:input_total_joint_length_m')}
              value={jointsLength}
              onChange={setJointsLength}
              placeholder={t('calculator:placeholder_enter_joint_length')}
              unit="m"
            />
            <TextInput
              label={t('calculator:input_total_trim_length_m')}
              value={trimLength}
              onChange={setTrimLength}
              placeholder={t('calculator:placeholder_enter_trim_length')}
              unit="m"
            />
          </>
        )}
        
        {!isInProjectCreating && (
          <CompactorSelector 
            selectedCompactor={selectedCompactor}
            onCompactorChange={setSelectedCompactor}
          />
        )}
        
        {!isInProjectCreating && (
          <Checkbox label={t('calculator:calculate_digging_prep')} checked={calculateDigging} onChange={setCalculateDigging} />
        )}

        {calculateDigging && (
          <div style={{ borderTop: `1px solid ${colors.borderLight}`, paddingTop: spacing.xl, marginTop: spacing.xs }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: `0 ${spacing["5xl"]}px` }}>
              <div>
                <label style={{ display: 'block', fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted, marginBottom: spacing.lg }}>{t('calculator:excavation_machinery')}</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                  {excavators.length === 0 ? (
                    <p style={{ color: colors.textDim }}>{t('calculator:no_excavators_found')}</p>
                  ) : (
                    excavators.map((excavator) => (
                      <div
                        key={excavator.id}
                        style={{ display: 'flex', alignItems: 'center', padding: `${spacing.lg}px ${spacing["2xl"]}px`, cursor: 'pointer', borderRadius: radii.lg, background: selectedExcavator?.id === excavator.id ? colors.bgHover : 'transparent', border: `1px solid ${selectedExcavator?.id === excavator.id ? colors.accentBlueBorder : colors.borderLight}` }}
                        onClick={() => setSelectedExcavator(excavator)}
                      >
                        <div style={{ width: 16, height: 16, borderRadius: radii.full, border: `2px solid ${selectedExcavator?.id === excavator.id ? colors.accentBlue : colors.borderMedium}`, marginRight: spacing.md, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {selectedExcavator?.id === excavator.id && <div style={{ width: 8, height: 8, borderRadius: radii.full, background: colors.accentBlue }} />}
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
                <label style={{ display: 'block', fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted, marginBottom: spacing.lg }}>{t('calculator:carrier_machinery')}</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                  {carriers.length === 0 ? (
                    <p style={{ color: colors.textDim }}>{t('calculator:no_carriers_found')}</p>
                  ) : (
                    carriers.map((carrier) => (
                      <div
                        key={carrier.id}
                        style={{ display: 'flex', alignItems: 'center', padding: `${spacing.lg}px ${spacing["2xl"]}px`, cursor: 'pointer', borderRadius: radii.lg, background: selectedCarrier?.id === carrier.id ? colors.bgHover : 'transparent', border: `1px solid ${selectedCarrier?.id === carrier.id ? colors.accentBlueBorder : colors.borderLight}` }}
                        onClick={() => setSelectedCarrier(carrier)}
                      >
                        <div style={{ width: 16, height: 16, borderRadius: radii.full, border: `2px solid ${selectedCarrier?.id === carrier.id ? colors.accentBlue : colors.borderMedium}`, marginRight: spacing.md, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {selectedCarrier?.id === carrier.id && <div style={{ width: 8, height: 8, borderRadius: radii.full, background: colors.accentBlue }} />}
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
          </div>
        )}

        {!isInProjectCreating && calculateDigging && selectedCarrier && (
          <TextInput
            label={t('calculator:transport_distance_label')}
            value={soilTransportDistance}
            onChange={(v) => { setSoilTransportDistance(v); setTape1TransportDistance(v); }}
            placeholder={t('calculator:placeholder_enter_transport_distance')}
            unit="m"
            helperText={t('calculator:set_to_zero_no_transport')}
          />
        )}
        
        {!isInProjectCreating && (
          <Checkbox label={t('calculator:calculate_transport_time_label')} checked={calculateTransport} onChange={setCalculateTransport} />
        )}

        {!isInProjectCreating && calculateTransport && (
          <>
            <div>
              <label style={{ display: 'block', fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted, marginBottom: spacing.lg }}>{t('calculator:transport_carrier')}</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                <div style={{ display: 'flex', alignItems: 'center', padding: `${spacing.lg}px ${spacing["2xl"]}px`, cursor: 'pointer', borderRadius: radii.lg, background: !selectedTransportCarrier ? colors.bgHover : 'transparent', border: `1px solid ${!selectedTransportCarrier ? colors.accentBlueBorder : colors.borderLight}` }} onClick={() => setSelectedTransportCarrier(null)}>
                  <div style={{ width: 16, height: 16, borderRadius: radii.full, border: `2px solid ${!selectedTransportCarrier ? colors.accentBlue : colors.borderMedium}`, marginRight: spacing.md, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {!selectedTransportCarrier && <div style={{ width: 8, height: 8, borderRadius: radii.full, background: colors.accentBlue }} />}
                  </div>
                  <span style={{ fontSize: fontSizes.base, color: colors.textSecondary }}>{t('calculator:default_wheelbarrow')}</span>
                </div>
                {carriers.length > 0 && carriers.map((carrier) => (
                  <div
                    key={carrier.id}
                    style={{ display: 'flex', alignItems: 'center', padding: `${spacing.lg}px ${spacing["2xl"]}px`, cursor: 'pointer', borderRadius: radii.lg, background: selectedTransportCarrier?.id === carrier.id ? colors.bgHover : 'transparent', border: `1px solid ${selectedTransportCarrier?.id === carrier.id ? colors.accentBlueBorder : colors.borderLight}` }}
                    onClick={() => setSelectedTransportCarrier(carrier)}
                  >
                    <div style={{ width: 16, height: 16, borderRadius: radii.full, border: `2px solid ${selectedTransportCarrier?.id === carrier.id ? colors.accentBlue : colors.borderMedium}`, marginRight: spacing.md, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {selectedTransportCarrier?.id === carrier.id && <div style={{ width: 8, height: 8, borderRadius: radii.full, background: colors.accentBlue }} />}
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
              unit="m"
              helperText={t('calculator:distance_transporting_materials')}
            />
          </>
        )}
        
        <Button variant="primary" fullWidth onClick={calculate} disabled={isLoading}>
          {isLoading ? t('calculator:loading_in_progress') : t('calculator:calculate_button')}
        </Button>
        
        {calculationError && (
          <div className="p-3 rounded-lg" style={{ background: `${colors.red}15`, border: `1px solid ${colors.red}40`, color: colors.textPrimary }}>
            {calculationError}
          </div>
        )}
        
        {(totalHours !== null || materials.length > 0) && (
          <div style={{ marginTop: spacing["6xl"], display: 'flex', flexDirection: 'column', gap: spacing["5xl"] }} ref={resultsRef}>
            {totalHours !== null && (
              <>
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
                    {taskBreakdown.map((task, index) => (
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
                        <span style={{ fontSize: fontSizes.base, color: colors.textMuted, fontFamily: fonts.body }}>{translateTaskName(task.task, t)}</span>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: spacing.xs }}>
                          <span style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.bold, color: colors.textSecondary, fontFamily: fonts.display }}>{task.hours.toFixed(2)}</span>
                          <span style={{ fontSize: fontSizes.sm, color: colors.textFaint, fontFamily: fonts.body }}>{t('calculator:hours_label')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </>
            )}
            {materials.length > 0 && (
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
                    <span style={{ fontSize: fontSizes.base, color: colors.textSubtle, fontFamily: fonts.display, fontWeight: fontWeights.semibold }}>{t('calculator:total_cost_colon')}</span>
                    <span style={{ fontSize: fontSizes["2xl"], fontWeight: fontWeights.extrabold, color: colors.textPrimary, fontFamily: fonts.display }}>
                      {materials.some(m => m.total_price !== null) ? `£${materials.reduce((sum, m) => sum + (m.total_price || 0), 0).toFixed(2)}` : t('calculator:not_available')}
                    </span>
                  </div>
                }
              />
            )}
          </div>
        )}
      </Card>
    </div>
  );
};

export default ArtificialGrassCalculator;
