import React, { useState, useEffect, useRef } from 'react';
import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import SlabFrameCalculator from './SlabFrameCalculator';
import type {} from 'react/jsx-runtime';
import { carrierSpeeds, getMaterialCapacity } from '../../constants/materialCapacity';
import { CompactorSelector, type CompactorOption } from './CompactorSelector';
import { calculateCompactingTime } from '../../lib/compactingCalculations';

interface SlabType {
  id: number;
  name: string;
  unit: string;
  estimated_hours: number;
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
  slab_mortar_mix_ratio?: string;
}

interface DiggingEquipment {
  id: string;
  name: string;
  type: string;
  "size (in tones)": number;
}

interface SlabCalculatorProps {
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
}

const SlabCalculator: React.FC<SlabCalculatorProps> = ({ 
  onResultsChange, 
  isInProjectCreating = false,
  calculateTransport: propCalculateTransport,
  setCalculateTransport: propSetCalculateTransport,
  selectedTransportCarrier: propSelectedTransportCarrier,
  setSelectedTransportCarrier: propSetSelectedTransportCarrier,
  transportDistance: propTransportDistance,
  setTransportDistance: propSetTransportDistance,
  carriers: propCarriers = [],
  selectedExcavator: propSelectedExcavator
}: SlabCalculatorProps) => {
  const companyId = useAuthStore(state => state.getCompanyId());
  const [area, setArea] = useState<string>('');
  const [tape1ThicknessCm, setTape1ThicknessCm] = useState<string>('');
  const [mortarThicknessCm, setMortarThicknessCm] = useState<string>('');
  const [selectedSlabId, setSelectedSlabId] = useState<string>('');
  const [cutSlabs, setCutSlabs] = useState<string>('');
  const [soilExcessCm, setSoilExcessCm] = useState<string>('');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [totalHours, setTotalHours] = useState<number | null>(null);
  const [calculationError, setCalculationError] = useState<string | null>(null);
  const [taskBreakdown, setTaskBreakdown] = useState<{task: string, hours: number, amount: number | string, unit: string, normalizedHours?: number}[]>([]);
  const [selectedGroutingId, setSelectedGroutingId] = useState<string>('');
  const [calculateDigging, setCalculateDigging] = useState<boolean>(false);
  const [selectedExcavator, setSelectedExcavator] = useState<DiggingEquipment | null>(null);
  const [selectedCarrier, setSelectedCarrier] = useState<DiggingEquipment | null>(null);
  const [excavators, setExcavators] = useState<DiggingEquipment[]>([]);
  const [carriersLocal, setCarriersLocal] = useState<DiggingEquipment[]>([]);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Use carriers from props if available (from ProjectCreating), otherwise use local state
  const carriers = propCarriers && propCarriers.length > 0 ? propCarriers : carriersLocal;
  const [transportDistance, setTransportDistance] = useState<string>('30');
  const [calculateTransport, setCalculateTransport] = useState<boolean>(false);
  const [selectedTransportCarrier, setSelectedTransportCarrier] = useState<DiggingEquipment | null>(null);
  const [selectedCompactor, setSelectedCompactor] = useState<CompactorOption | null>(null);

  const [addFrameBoard, setAddFrameBoard] = useState<boolean>(false);
  const [isFrameModalOpen, setIsFrameModalOpen] = useState<boolean>(false);
  const [frameResults, setFrameResults] = useState<{
    totalFrameSlabs: number;
    totalHours: number;
    totalFrameAreaM2: number;
    sides: Array<{ length: number; slabs: number }>;
    taskName: string;
    frameSlabsName: string;
    cuttingHours: number;
    cuttingTaskName: string;
    transportTime?: number;
  } | null>(null);

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

  // Sync local state back to parent when in ProjectCreating
  useEffect(() => {
    if (isInProjectCreating && propSetCalculateTransport) {
      propSetCalculateTransport(calculateTransport);
    }
  }, [calculateTransport, isInProjectCreating]);

  useEffect(() => {
    if (isInProjectCreating && propSetSelectedTransportCarrier) {
      propSetSelectedTransportCarrier(selectedTransportCarrier);
    }
  }, [selectedTransportCarrier, isInProjectCreating]);

  useEffect(() => {
    if (isInProjectCreating && propSetTransportDistance) {
      propSetTransportDistance(transportDistance);
    }
  }, [transportDistance, isInProjectCreating]);

  // Fetch all task templates (no filtering by 'slab')
  const { data: taskTemplates = [], isLoading, error: fetchError }: UseQueryResult<SlabType[]> = useQuery({
    queryKey: ['task_templates', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId)
        .order('name');
      if (error) throw error;
      return (data as Omit<SlabType, 'is_porcelain'>[]).map((item) => ({
        ...item,
        is_porcelain: item.name.toLowerCase().includes('slab') && !item.name.toLowerCase().includes('sandstone'),
      }));
    },
    enabled: !!companyId
  });

  // Add a new query to fetch time estimates for cutting tasks
  const { data: cuttingTasks = [] } = useQuery({
    queryKey: ['cutting_tasks', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('*')
        .eq('company_id', companyId)
        .or('name.ilike.%cutting%,name.ilike.%cut%')
        .order('name');
      
      if (error) throw error;
      console.log('Fetched cutting tasks:', data);
      return data;
    },
    enabled: !!companyId
  });

  // Fetch grouting methods (tasks with 'grouting' in the name)
  const { data: groutingMethods = [], isLoading: isLoadingGrouting } = useQuery({
    queryKey: ['grouting_methods', companyId],
    queryFn: async () => {
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
    queryKey: ['final_leveling_type_one_task', companyId],
    queryFn: async () => {
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
    queryKey: ['mixing_mortar_task', companyId],
    queryFn: async () => {
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
    queryKey: ['materialUsageConfig', 'slab', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('material_usage_configs')
        .select('calculator_id, material_id, slab_mortar_mix_ratio')
        .eq('calculator_id', 'slab')
        .eq('company_id', companyId);

      if (error) throw error;
      return data as MaterialUsageConfig[];
    },
    enabled: !!companyId
  });

  // Fetch details of the selected sand material
  const selectedSandMaterialId = materialUsageConfig?.[0]?.material_id;

  const { data: selectedSandMaterial } = useQuery<Material>({
    queryKey: ['material', selectedSandMaterialId, companyId],
    queryFn: async () => {
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

  // Add query for tape1 preparation tasks
  const { data: tape1PreparationTasks = [] } = useQuery({
    queryKey: ['tape1_preparation_tasks', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('*')
        .eq('company_id', companyId)
        .or('name.ilike.%tape 1%,name.ilike.%preparation%,name.ilike.%type 1%')
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!companyId
  });

  const fetchMaterialPrices = async (materials: Material[]) => {
    try {
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
    
    if (calculateDigging || calculateTransport) {
      fetchEquipment();
    }
  }, [calculateDigging, calculateTransport]);

  // Add time estimate functions
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

  const findDiggerTimeEstimate = (sizeInTons: number, totalTons: number) => {
    if (sizeInTons <= 3) return totalTons * 0.5;
    if (sizeInTons <= 8) return totalTons * 0.35;
    return totalTons * 0.25;
  };

  const findCarrierTimeEstimate = (sizeInTons: number, totalTons: number) => {
    if (sizeInTons <= 3) return totalTons * 0.4;
    if (sizeInTons <= 8) return totalTons * 0.3;
    return totalTons * 0.2;
  };

  // Helper function to match digger size in task names
  const matchesDiggerSize = (templateName: string, excavatorSize: number): boolean => {
    const name = templateName.toLowerCase();
    
    if (excavatorSize <= 0.5) {
      return name.includes('0.5t') || name.includes('0,5t') || name.includes('mini');
    } else if (excavatorSize <= 1) {
      return name.includes('1t') || name.includes('mini');
    } else if (excavatorSize <= 3) {
      return name.includes('3t') || name.includes('3-5t');
    } else if (excavatorSize <= 5) {
      return name.includes('5t') || name.includes('3-5t');
    } else if (excavatorSize <= 8) {
      return name.includes('6t') || name.includes('8t') || name.includes('6-10t');
    } else if (excavatorSize <= 10) {
      return name.includes('10t') || name.includes('6-10t');
    } else if (excavatorSize <= 20) {
      return name.includes('20t') || name.includes('11-20t');
    } else if (excavatorSize <= 30) {
      return name.includes('30t') || name.includes('21-30t');
    } else if (excavatorSize <= 40) {
      return name.includes('40t') || name.includes('31-40t');
    } else {
      return name.includes('40t+') || name.includes('large');
    }
  };

  const calculate = async () => {
    console.log('Calculating with values:', {
      area,
      tape1ThicknessCm,
      mortarThicknessCm,
      selectedSlabId,
      taskTemplates
    });

    if (!area) {
      setCalculationError('Please enter the area');
      return;
    }
    
    if (!tape1ThicknessCm) {
      setCalculationError('Please enter the Type 1 Aggregate thickness');
      return;
    }
    
    if (!mortarThicknessCm) {
      setCalculationError('Please enter the mortar thickness');
      return;
    }
    
    if (!selectedSlabId) {
      setCalculationError('Please select a slab type');
      return;
    }
    
    // Find the selected slab type using the ID
    const selectedSlabType = taskTemplates.find(type => type.id.toString() === selectedSlabId);
    
    if (!selectedSlabType) {
      setCalculationError(`Selected slab type not found (ID: ${selectedSlabId})`);
      return;
    }
    
    console.log('Selected slab type:', selectedSlabType);
    
    setCalculationError(null);
    
    try {
      const areaNum = parseFloat(area);
      // Convert cm to meters for calculations
      const tape1ThicknessM = parseFloat(tape1ThicknessCm) / 100; // cm to meters
      const mortarThicknessM = parseFloat(mortarThicknessCm) / 100; // cm to meters
      const soilExcessM = soilExcessCm ? parseFloat(soilExcessCm) / 100 : 0; // cm to meters
      const cutSlabsNum = cutSlabs ? parseInt(cutSlabs) : 0;
      
      // Calculate effective area for regular slabs (subtract frame area if applicable)
      const frameAreaM2 = addFrameBoard && frameResults ? frameResults.totalFrameAreaM2 : 0;
      const effectiveAreaM2 = areaNum - frameAreaM2;
      
      // Calculate base hours needed for installation based on time estimator
      let mainTaskHours = 0;
      
      // Check if the selected task has a valid unit and estimated_hours
      if (selectedSlabType.unit && selectedSlabType.estimated_hours !== undefined) {
        console.log(`Task: ${selectedSlabType.name}, Unit: ${selectedSlabType.unit}, Estimated hours: ${selectedSlabType.estimated_hours}`);
        
        const unitLower = selectedSlabType.unit.toLowerCase();
        if (unitLower === 'm2' || unitLower === 'square meters') {
          // Use effective area (total area minus frame area) for regular slab calculations
          mainTaskHours = effectiveAreaM2 * selectedSlabType.estimated_hours;
        } else {
          // For other units, use effective area
          mainTaskHours = effectiveAreaM2 * selectedSlabType.estimated_hours;
        }
      } else {
        console.warn('Selected task has no unit or estimated_hours:', selectedSlabType);
      }
      
      console.log('Main task hours:', mainTaskHours);
      
      // Calculate hours for cutting slabs based on time estimator
      let cuttingHours = 0;
      if (cutSlabsNum > 0) {
        // Find the appropriate cutting task based on slab type
        const isPorcelain = selectedSlabType.name.toLowerCase().includes('slab') && 
                           !selectedSlabType.name.toLowerCase().includes('sandstone');
        
        const cuttingTaskName = isPorcelain ? 'cutting porcelain' : 'cutting sandstones';
        const cuttingTask = cuttingTasks.find(task => 
          task.name.toLowerCase().includes(cuttingTaskName)
        );
        
        console.log('Cutting task:', cuttingTask);
        
        if (cuttingTask && cuttingTask.estimated_hours !== undefined) {
          // If estimated_hours is hours per cut, multiply by number of cuts
          // For example, if estimated_hours is 0.065 hours per cut, and cuts is 10, then total hours is 0.65
          cuttingHours = cutSlabsNum * cuttingTask.estimated_hours;
          console.log(`Cutting hours: ${cutSlabsNum} cuts × ${cuttingTask.estimated_hours} hours per cut = ${cuttingHours} hours`);
        } else {
          // Fallback to previous estimates if cutting task not found
          const minutesPerCut = isPorcelain ? 6 : 4;
          cuttingHours = (cutSlabsNum * minutesPerCut) / 60;
          console.log(`Cutting hours (fallback): ${cutSlabsNum} cuts × ${minutesPerCut} minutes per cut = ${cuttingHours} hours`);
        }
      }
      
      // Calculate materials needed
      const slabThicknessM = 0.02; // Standard slab thickness 2cm
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
      const { cementProportion, sandProportion } = getMortarMixRatioProportion(materialUsageConfig?.[0]?.slab_mortar_mix_ratio);
      
      const cementVolume = mortarVolumeM3 * cementProportion * 1.3; // configured proportion + 30% extra cement
      const sandVolume = mortarVolumeM3 * sandProportion * 1.5; // configured proportion + 50% extra sand
      // Convert sand volume to tonnes (approximately 1.6 tonnes per cubic meter)
      const sandTonnes = sandVolume * 1.6;
      
      // Convert cement volume to bags (1 bag = 25kg = ~0.0167 cubic meters)
      const cementBags = cementVolume / 0.0167;
      
      // Get transport distance in meters
      const transportDistanceMeters = parseFloat(transportDistance) || 30;

      // Calculate material transport times if "Calculate transport time" is checked
      let slabTransportTime = 0;
      let sandTransportTime = 0;
      let cementTransportTime = 0;
      let normalizedSlabTransportTime = 0;
      let normalizedSandTransportTime = 0;
      let normalizedCementTransportTime = 0;
      
      // Calculate slab pieces based on area
      const slabPieces = areaNum * 2; // Approximate pieces

      if (calculateTransport) {
        // Use selected transport carrier or default to wheelbarrow 0.125t
        let carrierSizeForTransport = 0.125;
        
        if (selectedTransportCarrier) {
          carrierSizeForTransport = selectedTransportCarrier["size (in tones)"] || 0.125;
        }
        if (slabPieces > 0) {
          const slabResult = calculateMaterialTransportTime(slabPieces, carrierSizeForTransport, 'slabs', transportDistanceMeters);
          slabTransportTime = slabResult.totalTransportTime;
          normalizedSlabTransportTime = slabResult.normalizedTransportTime;
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

      if (selectedCompactor && tape1ThicknessCm) {
        // Use tape1 thickness for compacting calculation in Slab Calculator (no sand layer)
        const compactingDepthCm = parseFloat(tape1ThicknessCm || '0');
        
        if (compactingDepthCm > 0) {
          // In Slab Calculator, we only compact type1 (tape1), not mortar
          const compactingCalc = calculateCompactingTime(selectedCompactor, compactingDepthCm, 'type1');
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
          hours: mainTaskHours,
          amount: effectiveAreaM2,
          unit: 'square meters'
        });
      }
      
      // Add slab transport if applicable
      if (calculateTransport && slabTransportTime > 0) {
        breakdown.push({
          task: 'transport slabs',
          hours: slabTransportTime,
          amount: `${slabPieces.toFixed(0)} pieces`,
          unit: 'pieces',
          normalizedHours: normalizedSlabTransportTime
        });
      }

      // Add sand transport if applicable
      if (calculateTransport && sandTransportTime > 0) {
        breakdown.push({
          task: 'transport sand',
          hours: sandTransportTime,
          amount: `${sandTonnes.toFixed(2)} tonnes`,
          unit: 'tonnes',
          normalizedHours: normalizedSandTransportTime
        });
      }

      // Add cement transport if applicable
      if (calculateTransport && cementTransportTime > 0) {
        breakdown.push({
          task: 'transport cement',
          hours: cementTransportTime,
          amount: `${cementBags.toFixed(0)} bags`,
          unit: 'bags',
          normalizedHours: normalizedCementTransportTime
        });
      }
      
      // Only add cutting task if it has hours
      if (cuttingHours > 0) {
        const isPorcelain = selectedSlabType.name.toLowerCase().includes('slab') && 
                           !selectedSlabType.name.toLowerCase().includes('sandstone');
        const cuttingTaskName = isPorcelain ? 'cutting porcelain' : 'cutting sandstones';
        breakdown.push({ 
          task: cuttingTaskName,
          hours: cuttingHours,
          amount: cutSlabsNum,
          unit: 'slabs'
        });
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
          // Dimensions are in mm, convert to meters
          const dim1Mm = parseInt(match[1]);
          const dim2Mm = parseInt(match[2]);
          const dim1M = dim1Mm / 1000;
          const dim2M = dim2Mm / 1000;
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

      // Add frame primer coating if applicable
      if (addFrameBoard && frameResults && frameResults.totalFrameSlabs > 0) {
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
      if (calculateDigging && activeExcavator && tape1ThicknessM > 0) {
        // Calculate total excavation volume (soil volume)
        const totalExcavationVolumeM3 = soilVolumeM3; // Use the already calculated soil volume
        const totalTons = totalExcavationVolumeM3 * 1.5; // Use consistent 1.5 tonnes per cubic meter for soil

        // Add soil excavation time using template matching first
        let soilExcavationTime = 0;
        const excavatorSize = activeExcavator["size (in tones)"] || 0;
        const carrierSize = selectedCarrier ? selectedCarrier["size (in tones)"] || 0 : 0;

        // Find matching soil excavation template (same logic as ProjectCreating.tsx)
        let soilExcavationTemplate = null;

        if (selectedCarrier) {
          // Search for template with both excavator and carrier
          soilExcavationTemplate = taskTemplates.find((template: any) => {
            const name = template.name.toLowerCase();
            const nameMatches = name.includes('excavation') && name.includes('soil');
            const diggerMatches = matchesDiggerSize(name, excavatorSize);
            const carrierMatches = name.includes(`${carrierSize}t`) && 
                                 (name.includes('barrow') || 
                                  name.includes('wheelbarrow') || 
                                  name.includes('carrier') || 
                                  name.includes('dumper'));

            return nameMatches && diggerMatches && carrierMatches;
          });
        }

        // Fallback to template with just excavator
        if (!soilExcavationTemplate) {
          soilExcavationTemplate = taskTemplates.find((template: any) => {
            const name = template.name.toLowerCase();
            const nameMatches = name.includes('excavation') && name.includes('soil');
            const diggerMatches = matchesDiggerSize(name, excavatorSize);
            
            return nameMatches && diggerMatches;
          });
        }

        // Final fallback to any soil excavation template
        if (!soilExcavationTemplate) {
          soilExcavationTemplate = taskTemplates.find((template: any) => {
            const name = template.name.toLowerCase();
            return name.includes('excavation') && name.includes('soil');
          });
        }

        if (soilExcavationTemplate && soilExcavationTemplate.estimated_hours) {
          // Use estimated_hours as rate per tonne and multiply by actual tonnage
          soilExcavationTime = soilExcavationTemplate.estimated_hours * totalTons;
        } else {
          // Fallback to manual calculation
          const excavationTime = findDiggerTimeEstimate(excavatorSize, totalTons);
          const transportTime = selectedCarrier ? findCarrierTimeEstimate(carrierSize, totalTons) : 0;
          soilExcavationTime = excavationTime + transportTime;
        }

        // Add tape1 preparation time using template matching
        let tape1PreparationTime = 0;
        if (tape1ThicknessM > 0) {
          // Use already calculated tape1 values with consistent density
          const tape1Tons = tape1VolumeM3 * 2.1; // Use consistent 2.1 tonnes per cubic meter for tape1
          
          // Find matching tape1 preparation template
          let tape1Template = null;
          
          if (selectedCarrier) {
            // Try to find template with both excavator and carrier
            tape1Template = tape1PreparationTasks.find((template: any) => {
              const name = template.name.toLowerCase();
              const nameMatches = 
                name.includes('tape 1') || 
                name.includes('preparation') || 
                name.includes('type 1');
              const diggerMatches = matchesDiggerSize(name, excavatorSize);
              const carrierMatches = name.includes(`${carrierSize}t`) && 
                                   (name.includes('barrow') || 
                                    name.includes('wheelbarrow') || 
                                    name.includes('carrier') || 
                                    name.includes('dumper'));
              
              return nameMatches && diggerMatches && carrierMatches;
            });
          }

          // Fallback to template with just excavator
          if (!tape1Template) {
            tape1Template = tape1PreparationTasks.find((template: any) => {
              const name = template.name.toLowerCase();
              const nameMatches = 
                name.includes('tape 1') || 
                name.includes('preparation') || 
                name.includes('type 1');
              const diggerMatches = matchesDiggerSize(name, excavatorSize);
              
              return nameMatches && diggerMatches;
            });
          }

          // Final fallback to any tape1 preparation template
          if (!tape1Template) {
            tape1Template = tape1PreparationTasks.find((template: any) => {
              const name = template.name.toLowerCase();
              return name.includes('tape 1') || name.includes('preparation') || name.includes('type 1');
            });
          }

          if (tape1Template && tape1Template.estimated_hours) {
            // Use estimated_hours as rate per tonne and multiply by actual tonnage
            tape1PreparationTime = tape1Template.estimated_hours * tape1Tons;
          } else {
            // Fallback to manual calculation
            const prepExcavationTime = findDiggerTimeEstimate(excavatorSize, tape1Tons);
            const prepTransportTime = selectedCarrier ? findCarrierTimeEstimate(carrierSize, tape1Tons) : 0;
            tape1PreparationTime = prepExcavationTime + prepTransportTime;
          }
        }

        breakdown.push({
          task: 'Soil excavation',
          hours: soilExcavationTime,
          amount: totalTons,
          unit: 'tonnes'
        });

        if (tape1PreparationTime > 0) {
          breakdown.push({
            task: 'Tape 1 preparation',
            hours: tape1PreparationTime,
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
      }
      
      // Calculate total hours
      let hours = breakdown.reduce((sum, item) => sum + item.hours, 0);
      
      // Add frame results if applicable
      if (addFrameBoard && frameResults) {
        hours += frameResults.totalHours;
        // Add frame laying task
        breakdown.push({
          task: frameResults.frameSlabsName,
          hours: frameResults.totalHours - frameResults.cuttingHours, // Just the laying hours
          amount: frameResults.totalFrameSlabs,
          unit: 'pieces'
        });
        
        // Add frame cutting task if there are cutting hours
        if (frameResults.cuttingHours > 0) {
          const totalCuts = frameResults.sides.length * 3; // 3 cuts per side
          breakdown.push({
            task: frameResults.cuttingTaskName || 'Frame cutting',
            hours: frameResults.cuttingHours,
            amount: totalCuts,
            unit: 'cuts'
          });
        }

        // Add frame transport tasks from frameResults if available
        if (frameResults && frameResults.transportTime && frameResults.transportTime > 0) {
          // Frame slabs are 0.15 m² each (90x60cm)
          // Transport time is calculated per 0.54 m²
          // Scale transport time based on total frame area
          const FRAME_SLAB_AREA_M2 = 0.54;
          const scaledFrameTransportTime = (frameResults.totalFrameAreaM2 / FRAME_SLAB_AREA_M2) * frameResults.transportTime;
          
          breakdown.push({
            task: 'transport frame slabs',
            hours: scaledFrameTransportTime,
            amount: frameResults.totalFrameAreaM2,
            unit: 'square meters'
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
      if (finalLevelingTypeOneTask && finalLevelingTypeOneTask.estimated_hours !== undefined) {
        breakdown.push({
          task: 'final leveling (type 1)',
          hours: effectiveAreaM2 * finalLevelingTypeOneTask.estimated_hours,
          amount: effectiveAreaM2,
          unit: 'square meters',
          event_task_id: finalLevelingTypeOneTask.id
        });
      }

      // Add mixing mortar task if available
      if (mixingMortarTask && mixingMortarTask.estimated_hours !== undefined) {
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
      
      // Prepare materials list (excluding slab type)
      const materialsList: Material[] = [
        { name: 'Soil excavation', amount: Number(soilTonnes.toFixed(2)), unit: 'tonnes', price_per_unit: null, total_price: null },
        { name: selectedSandMaterial?.name || 'Sand', amount: Number(sandTonnes.toFixed(2)), unit: 'tonnes', price_per_unit: selectedSandMaterial?.price || null, total_price: null },
        { name: 'tape1', amount: Number(tape1Tonnes.toFixed(2)), unit: 'tonnes', price_per_unit: null, total_price: null },
        { name: 'Cement', amount: Math.ceil(cementBags), unit: 'bags', price_per_unit: null, total_price: null }
      ];
      
      // Add frame slabs to materials if applicable
      if (addFrameBoard && frameResults && frameResults.totalFrameSlabs > 0) {
        materialsList.push({
          name: frameResults.frameSlabsName,
          amount: frameResults.totalFrameSlabs,
          unit: 'pieces',
          price_per_unit: null,
          total_price: null
        });
      }
      
      // Fetch prices for materials
      const materialsWithPrices = await fetchMaterialPrices(materialsList);
      
      setMaterials(materialsWithPrices);
      setTotalHours(hours);
      setTaskBreakdown(breakdown);
    } catch (err) {
      console.error('Error in calculation:', err);
      setCalculationError(`An error occurred during calculation: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // Add useEffect to notify parent of result changes
  useEffect(() => {
    if (totalHours !== null && materials.length > 0) {
      const formattedResults = {
        name: selectedSlabId ? taskTemplates.find(type => type.id.toString() === selectedSlabId)?.name || 'Slab Installation' : 'Slab Installation',
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
  }, [totalHours, materials, taskBreakdown, area, selectedSlabId, taskTemplates, onResultsChange]);

  // Scroll to results when they appear
  useEffect(() => {
    if (materials.length > 0 && resultsRef.current) {
      setTimeout(() => {
        // Check if we're inside a modal (has ancestor with overflow-y-auto)
        const modalContainer = resultsRef.current?.closest('[data-calculator-results]');
        if (modalContainer) {
          // Scroll within the modal
          modalContainer.scrollTop = resultsRef.current.offsetTop - 100;
        } else {
          // Scroll the page
          resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [materials]);

  // Only show slab-related templates in the dropdown
  const slabTypeOptions = taskTemplates.filter((t: SlabType) => t.name.toLowerCase().includes('slab'));

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Slab Installation Calculator</h2>
      <p className="text-sm text-gray-600">
        Calculate materials, time, and costs for slab installation projects.
      </p>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Area (m²)</label>
          <input
            type="number"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 form-input"
            placeholder="Enter area in square meters"
            min="0"
            step="0.01"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700">Type 1 Aggregate Thickness (cm)</label>
          <input
            type="number"
            value={tape1ThicknessCm}
            onChange={(e) => setTape1ThicknessCm(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 form-input"
            placeholder="Enter thickness in centimeters"
            min="0"
            step="0.5"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700">Mortar Thickness (cm)</label>
          <input
            type="number"
            value={mortarThicknessCm}
            onChange={(e) => setMortarThicknessCm(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 form-input"
            placeholder="Enter thickness in centimeters"
            min="0"
            step="0.5"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700">Soil Excess (cm)</label>
          <input
            type="number"
            value={soilExcessCm}
            onChange={(e) => setSoilExcessCm(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 form-input"
            placeholder="Enter additional soil depth in centimeters"
            min="0"
            step="0.5"
          />
          <p className="text-xs text-gray-500 mt-1">Additional depth (if starting level is above the finish level. Add minus before to decrease amount of excavated soil if the starting level is below the finish level)</p>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700">Slab Type</label>
          <select
            value={selectedSlabId}
            onChange={(e) => {
              const value = e.target.value;
              console.log('Selected slab ID:', value);
              setSelectedSlabId(value);
            }}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 form-select"
            disabled={isLoading}
          >
            <option value="">Select slab type</option>
            {slabTypeOptions.length > 0 && slabTypeOptions.map((type: SlabType) => (
              <option key={type.id} value={type.id.toString()}>
                {type.name}
              </option>
            ))}
          </select>
          {isLoading && <p className="text-sm text-gray-500 mt-1">Loading slab types...</p>}
          {fetchError && <p className="text-sm text-red-500 mt-1">Error loading slab types</p>}
          <p className="text-sm text-gray-500 mt-1">Selected ID: {selectedSlabId}</p>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700">Number of Slabs to be Cut (optional)</label>
          <input
            type="number"
            value={cutSlabs}
            onChange={(e) => setCutSlabs(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 form-input"
            placeholder="Enter number of cuts"
            min="0"
            step="1"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700">Grouting Method</label>
          <select
            value={selectedGroutingId}
            onChange={e => setSelectedGroutingId(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 form-select"
            disabled={isLoadingGrouting}
          >
            <option value="">Select grouting method</option>
            {groutingMethods.map((method: { id: string; name: string }) => (
              <option key={method.id} value={method.id}>{method.name}</option>
            ))}
          </select>
          {isLoadingGrouting && <p className="text-sm text-gray-500 mt-1">Loading grouting methods...</p>}
          <p className="text-xs text-red-600 mt-1">To add a new method, create a task that includes "grouting" in the name and add the amount of grout separately.</p>
        </div>
        
        {/* Compactor Type Selection */}
        <CompactorSelector 
          selectedCompactor={selectedCompactor}
          onCompactorChange={setSelectedCompactor}
        />
        
        <div>
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={addFrameBoard}
              onChange={(e) => setAddFrameBoard(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-gray-700">Add frame board from slabs</span>
          </label>
          {addFrameBoard && (
            <button
              onClick={() => setIsFrameModalOpen(true)}
              className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
            >
              Configure Frame Slabs
            </button>
          )}
          {frameResults && (
            <div className="mt-2 p-3 bg-gray-50 rounded-md border border-gray-200">
              <p className="text-sm text-gray-800">
                <strong>{frameResults.frameSlabsName}:</strong> {frameResults.totalFrameSlabs} pieces, {frameResults.totalHours.toFixed(2)} hours
                <br />
                <strong>Frame Area:</strong> {frameResults.totalFrameAreaM2.toFixed(2)} m²
              </p>
            </div>
          )}
        </div>
        
        {!isInProjectCreating && (
          <div className="mt-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={calculateDigging}
                onChange={(e) => setCalculateDigging(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">Calculate digging, preparation and loading sand time</span>
            </label>
          </div>
        )}

        <div className="mt-4">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={calculateTransport}
              onChange={(e) => setCalculateTransport(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-gray-700">Calculate Transport Time (default as 0.125 wheelbarrow)</span>
          </label>
        </div>

        {/* Equipment Selection */}
        {calculateDigging && (
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Excavation Machinery</label>
              <div className="space-y-2">
                {excavators.length === 0 ? (
                  <p className="text-gray-500">No excavators found</p>
                ) : (
                  excavators.map((excavator) => (
                    <div 
                      key={excavator.id}
                      className="flex items-center p-2 cursor-pointer"
                      onClick={() => setSelectedExcavator(excavator)}
                    >
                      <div className={`w-4 h-4 rounded-full border mr-2 ${
                        selectedExcavator?.id === excavator.id 
                          ? 'border-gray-400' 
                          : 'border-gray-400'
                      }`}>
                        <div className={`w-2 h-2 rounded-full m-0.5 ${
                          selectedExcavator?.id === excavator.id 
                            ? 'bg-gray-400' 
                            : 'bg-transparent'
                        }`}></div>
                      </div>
                      <div>
                        <span className="text-gray-800">{excavator.name}</span>
                        <span className="text-sm text-gray-600 ml-2">({excavator["size (in tones)"]} tons)</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Carrier Machinery</label>
              <div className="space-y-2">
                {carriers.length === 0 ? (
                  <p className="text-gray-500">No carriers found</p>
                ) : (
                  carriers.map((carrier) => (
                    <div 
                      key={carrier.id}
                      className="flex items-center p-2 cursor-pointer"
                      onClick={() => setSelectedCarrier(carrier)}
                    >
                      <div className={`w-4 h-4 rounded-full border mr-2 ${
                        selectedCarrier?.id === carrier.id 
                          ? 'border-gray-400' 
                          : 'border-gray-400'
                      }`}>
                        <div className={`w-2 h-2 rounded-full m-0.5 ${
                          selectedCarrier?.id === carrier.id 
                            ? 'bg-gray-400' 
                            : 'bg-transparent'
                        }`}></div>
                      </div>
                      <div>
                        <span className="text-gray-800">{carrier.name}</span>
                        <span className="text-sm text-gray-600 ml-2">({carrier["size (in tones)"]} tons)</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Transport Carrier Selection */}
        {calculateTransport && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Transport Carrier (optional - defaults to 0.125 wheelbarrow)</label>
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
                  <span className="text-gray-800">Default (0.125t Wheelbarrow)</span>
                </div>
              </div>
              {carriers.length > 0 && carriers.map((carrier) => (
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
          </div>
        )}
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Transport Distance in meters (each way)</label>
          <input
            type="number"
            value={transportDistance}
            onChange={(e) => setTransportDistance(e.target.value)}
            className="w-full p-2 border rounded-md"
            placeholder="Enter transport distance"
            min="0"
            step="1"
          />
        </div>
        
        <button
          onClick={calculate}
          disabled={isLoading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors disabled:bg-blue-300"
        >
          {isLoading ? 'Loading...' : 'Calculate'}
        </button>
        
        {calculationError && (
          <div className="p-3 bg-red-50 text-red-700 rounded-md">
            {calculationError}
          </div>
        )}
        
        {totalHours !== null && (
          <div className="mt-6 space-y-4" ref={resultsRef}>
            <div>
              <h3 className="text-lg font-medium">Total Labor Hours: <span className="text-blue-600">{totalHours.toFixed(2)} hours</span></h3>
              
              <div className="mt-2">
                <h4 className="font-medium text-gray-700 mb-2">Task Breakdown:</h4>
                <ul className="space-y-1 pl-5 list-disc">
                  {taskBreakdown.map((task: { task: string; hours: number }, index: number) => (
                    <li key={index} className="text-sm">
                      <span className="font-medium">{task.task}:</span> {task.hours.toFixed(2)} hours
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            
            <div>
              <h3 className="font-medium mb-2">Materials Required:</h3>
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
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Price per Unit
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total Price
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {materials.map((material, index) => (
                      <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                          {material.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                          {material.amount.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                          {material.unit}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                          {material.price_per_unit ? `£${material.price_per_unit.toFixed(2)}` : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                          {material.total_price ? `£${material.total_price.toFixed(2)}` : 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                {/* Add total price row */}
                <div className="mt-4 text-right pr-6">
                  <p className="text-sm font-medium">
                    Total Cost: {
                      materials.some(m => m.total_price !== null) 
                        ? `£${materials.reduce((sum, m) => sum + (m.total_price || 0), 0).toFixed(2)}`
                        : 'N/A'
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Slab Frame Calculator Modal */}
      <SlabFrameCalculator
        isOpen={isFrameModalOpen}
        onClose={() => setIsFrameModalOpen(false)}
        onResultsChange={(results) => setFrameResults(results)}
        selectedSlabType={selectedSlabId ? taskTemplates.find(type => type.id.toString() === selectedSlabId) : null}
        cuttingTasks={cuttingTasks}
      />
    </div>
  );
};

export default SlabCalculator;
