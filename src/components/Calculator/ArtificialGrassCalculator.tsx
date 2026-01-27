import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { carrierSpeeds, getMaterialCapacity } from '../../constants/materialCapacity';
import { CompactorSelector, type CompactorOption } from './CompactorSelector';
import { calculateCompactingTime } from '../../lib/compactingCalculations';

interface Material {
  name: string;
  amount: number;
  unit: string;
  price_per_unit: number | null;
  total_price: number | null;
}

interface ArtificialGrassCalculatorProps {
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

interface MaterialUsageConfig {
  calculator_id: string;
  material_id: string;
}

interface DiggingEquipment {
  id: string;
  name: string;
  type: string;
  "size (in tones)": number;
}

const ArtificialGrassCalculator: React.FC<ArtificialGrassCalculatorProps> = ({ 
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
}) => {
  const companyId = useAuthStore(state => state.getCompanyId());
  const [area, setArea] = useState<string>('');
  const [tape1ThicknessCm, setTape1ThicknessCm] = useState<string>('');
  const [sandThicknessCm, setSandThicknessCm] = useState<string>('');
  const [soilExcessCm, setSoilExcessCm] = useState<string>('');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [totalHours, setTotalHours] = useState<number | null>(null);
  const [calculationError, setCalculationError] = useState<string | null>(null);
  const [taskBreakdown, setTaskBreakdown] = useState<{task: string, hours: number, amount: string, unit: string}[]>([]);
  const [jointsLength, setJointsLength] = useState<string>('');
  const [trimLength, setTrimLength] = useState<string>('');
  const [calculateDigging, setCalculateDigging] = useState<boolean>(false);
  const [selectedExcavator, setSelectedExcavator] = useState<DiggingEquipment | null>(null);
  const [selectedCarrier, setSelectedCarrier] = useState<DiggingEquipment | null>(null);
  const [excavators, setExcavators] = useState<DiggingEquipment[]>([]);
  const [carriersLocal, setCarriersLocal] = useState<DiggingEquipment[]>([]);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [transportDistance, setTransportDistance] = useState<string>('30');
  const [calculateTransport, setCalculateTransport] = useState<boolean>(false);
  const [selectedTransportCarrier, setSelectedTransportCarrier] = useState<DiggingEquipment | null>(null);
  const [selectedCompactor, setSelectedCompactor] = useState<CompactorOption | null>(null);

  // Use carriers from props if available (from ProjectCreating), otherwise use local state
  const carriers = propCarriers && propCarriers.length > 0 ? propCarriers : carriersLocal;

  // Fetch task template for artificial grass laying
  const { data: layingTask, isLoading } = useQuery({
    queryKey: ['artificial_grass_laying_task', companyId],
    queryFn: async () => {
      console.log('Fetching artificial grass laying task...');
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
      
      console.log('Fetched laying task:', data);
      if (!data) {
        throw new Error('No task found for laying artificial grass');
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

  // Fetch task template for jointing artificial grass
  const { data: jointingTask } = useQuery({
    queryKey: ['jointing_artificial_grass_task', companyId],
    queryFn: async () => {
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
    queryKey: ['trimming_edges_artificial_grass_task', companyId],
    queryFn: async () => {
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

  // Fetch task template for final leveling type 1
  const { data: finalLevelingTypeOneTask } = useQuery({
    queryKey: ['final_leveling_type_one_task'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('name', 'final leveling (type 1)')
        .single();
      if (error) {
        console.error('Error fetching final leveling type 1 task:', error);
        throw error;
      }
      return data;
    }
  });

  // Fetch task template for final leveling sand
  const { data: finalLevelingSandTask } = useQuery({
    queryKey: ['final_leveling_sand_task'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('name', 'final leveling (sand)')
        .single();
      if (error) {
        console.error('Error fetching final leveling sand task:', error);
        throw error;
      }
      return data;
    }
  });

    // Fetch material usage configuration for Artificial Grass Calculator
    const { data: materialUsageConfig, isLoading: isLoadingConfig } = useQuery<MaterialUsageConfig[]>({
    queryKey: ['materialUsageConfig', 'artificial_grass', companyId],
    queryFn: async () => {
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

  const { data: selectedSandMaterial, isLoading: isLoadingSelectedSand } = useQuery<Material>({
    queryKey: ['material', selectedSandMaterialId, companyId],
    queryFn: async () => {
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

  // Add query for soil excavation tasks
  const { data: soilExcavationTasks = [] } = useQuery({
    queryKey: ['soil_excavation_tasks', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('*')
        .eq('company_id', companyId)
        .or('name.ilike.%soil excavation%,name.ilike.%excavation%,name.ilike.%digging%')
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!companyId
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
    const carrierSpeedData = carrierSpeeds.find(c => c.size === carrierSize);
    const carrierSpeed = carrierSpeedData?.speed || 4000;
    const materialCapacityUnits = getMaterialCapacity(materialType, carrierSize);
    const trips = Math.ceil(materialAmount / materialCapacityUnits);
    const timePerTrip = (transportDistanceMeters * 2) / carrierSpeed;
    const totalTransportTime = trips * timePerTrip;
    const normalizedTransportTime = (totalTransportTime * 30) / transportDistanceMeters;
    return { trips, totalTransportTime, normalizedTransportTime };
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
    if (!area || !tape1ThicknessCm || !sandThicknessCm) {
      setCalculationError('Please fill in all required fields');
      return;
    }

    setCalculationError(null);

    try {
      const areaNum = parseFloat(area);
      const tape1ThicknessM = parseFloat(tape1ThicknessCm) / 100;
      const sandThicknessM = parseFloat(sandThicknessCm) / 100;
      const soilExcessM = soilExcessCm ? parseFloat(soilExcessCm) / 100 : 0;

      // Calculate base hours needed for installation
      let mainTaskHours = 0;
      console.log('Laying task data:', layingTask);
      
      if (layingTask?.unit && layingTask?.estimated_hours !== undefined) {
        console.log(`Task: ${layingTask.name}, Unit: ${layingTask.unit}, Estimated hours: ${layingTask.estimated_hours}`);
        
        const unitLower = layingTask.unit.toLowerCase();
        if (unitLower === 'm2' || unitLower === 'square meters') {
          mainTaskHours = areaNum * layingTask.estimated_hours;
          console.log(`Calculated main task hours: ${areaNum} m² × ${layingTask.estimated_hours} hours/m² = ${mainTaskHours} hours`);
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
      const transportDistanceMeters = parseFloat(transportDistance) || 30;

      // Calculate material transport times if "Calculate transport time" is checked
      let sandTransportTime = 0;
      let normalizedSandTransportTime = 0;

      if (calculateTransport) {
        let carrierSizeForTransport = 0.125;
        
        if (selectedTransportCarrier) {
          carrierSizeForTransport = selectedTransportCarrier["size (in tones)"] || 0.125;
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
      if (sandScreedingTask && sandScreedingTask.estimated_hours !== undefined) {
        breakdown.push({
          task: 'sand screeding',
          hours: areaNum * sandScreedingTask.estimated_hours,
          amount: areaNum.toString(),
          unit: 'square meters'
        });
      }

      // Add jointing artificial grass task if available and jointsLength is provided
      const jointsLengthNum = parseFloat(jointsLength);
      if (jointingTask && jointingTask.estimated_hours !== undefined && jointsLength && !isNaN(jointsLengthNum) && jointsLengthNum > 0) {
        breakdown.push({
          task: 'jointing artificial grass',
          hours: jointsLengthNum * jointingTask.estimated_hours,
          amount: jointsLengthNum.toString(),
          unit: 'meters'
        });
      }

      // Add trimming edges artificial grass task if available and trimLength is provided
      const trimLengthNum = parseFloat(trimLength);
      if (trimmingEdgesTask && trimmingEdgesTask.estimated_hours !== undefined && trimLength && !isNaN(trimLengthNum) && trimLengthNum > 0) {
        breakdown.push({
          task: 'trimming edges (artificial grass)',
          hours: trimLengthNum * trimmingEdgesTask.estimated_hours,
          amount: trimLengthNum.toString(),
          unit: 'meters'
        });
      }

      // Add final leveling type 1 task if available
      if (finalLevelingTypeOneTask && finalLevelingTypeOneTask.estimated_hours !== undefined) {
        breakdown.push({
          task: 'final leveling (type 1)',
          hours: areaNum * finalLevelingTypeOneTask.estimated_hours,
          amount: areaNum.toString(),
          unit: 'square meters',
          event_task_id: finalLevelingTypeOneTask.id
        });
      }

      // Add final leveling sand task if available
      if (finalLevelingSandTask && finalLevelingSandTask.estimated_hours !== undefined) {
        breakdown.push({
          task: 'final leveling (sand)',
          hours: areaNum * finalLevelingSandTask.estimated_hours,
          amount: areaNum.toString(),
          unit: 'square meters',
          event_task_id: finalLevelingSandTask.id
        });
      }

      // Add transport tasks if applicable
      if (calculateTransport && sandTransportTime > 0) {
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

      if (selectedCompactor && (sandThicknessCm || tape1ThicknessCm)) {
        // In Artificial Grass Calculator, compact both sand and type1 layers (sum of both thicknesses)
        const sandDepthCm = parseFloat(sandThicknessCm || '0');
        const tape1DepthCm = parseFloat(tape1ThicknessCm || '0');
        const totalCompactingDepthCm = sandDepthCm + tape1DepthCm;
        
        if (totalCompactingDepthCm > 0) {
          // Use sand material type as the primary type (both materials need compacting)
          const materialType = 'sand';
          
          const compactingCalc = calculateCompactingTime(selectedCompactor, totalCompactingDepthCm, materialType);
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

      if (calculateDigging && activeExcavator) {
        const excavatorSize = activeExcavator["size (in tones)"] || 0;
        const carrierSize = selectedCarrier ? selectedCarrier["size (in tones)"] || 0 : 0;

        // Add soil excavation time using template matching first
        let soilExcavationTime = 0;
        
        // Find matching soil excavation template
        let soilExcavationTemplate = null;
        
        if (selectedCarrier) {
          // Try to find template with both excavator and carrier
          soilExcavationTemplate = soilExcavationTasks.find((template: any) => {
            const name = template.name.toLowerCase();
            const nameMatches = 
              name.includes('soil excavation') || 
              name.includes('excavation') || 
              name.includes('digging');
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
          soilExcavationTemplate = soilExcavationTasks.find((template: any) => {
            const name = template.name.toLowerCase();
            const nameMatches = 
              name.includes('soil excavation') || 
              name.includes('excavation') || 
              name.includes('digging');
            const diggerMatches = matchesDiggerSize(name, excavatorSize);
            
            return nameMatches && diggerMatches;
          });
        }

        // Final fallback to any soil excavation template
        if (!soilExcavationTemplate) {
          soilExcavationTemplate = soilExcavationTasks.find((template: any) => {
            const name = template.name.toLowerCase();
            return name.includes('soil excavation') || name.includes('excavation') || name.includes('digging');
          });
        }

        if (soilExcavationTemplate && soilExcavationTemplate.estimated_hours) {
          // Use estimated_hours as rate per tonne and multiply by actual tonnage
          soilExcavationTime = soilExcavationTemplate.estimated_hours * soilTonnes;
        } else {
          // Fallback to manual calculation
          const excavationTime = findDiggerTimeEstimate(excavatorSize, soilTonnes);
          const transportTime = selectedCarrier ? findCarrierTimeEstimate(carrierSize, soilTonnes) : 0;
          soilExcavationTime = excavationTime + transportTime;
        }

        // Add tape1 preparation time using template matching
        let tape1PreparationTime = 0;
        if (tape1ThicknessM > 0) {
          const tape1Tons = tape1Tonnes; // Use the already calculated tape1 tonnes
          
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

        // Add digging tasks to breakdown
        breakdown.unshift(
          { 
            task: 'Soil Excavation',
            hours: soilExcavationTime,
            amount: soilTonnes.toFixed(2),
            unit: 'tonnes'
          }
        );

        if (tape1PreparationTime > 0) {
          breakdown.unshift({
            task: 'Tape 1 preparation',
            hours: tape1PreparationTime,
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
      }

      // Calculate total hours
      const totalHours = breakdown.reduce((sum, item) => sum + item.hours, 0);

      // Prepare materials list
      const materialsList: Material[] = [
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
      setCalculationError('An error occurred during calculation');
    }
  };

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
        if (modalContainer) {
          modalContainer.scrollTop = resultsRef.current.offsetTop - 100;
        } else {
          resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [materials]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Artificial Grass Installation Calculator</h2>
      <p className="text-sm text-gray-600">
        Calculate materials, time, and costs for artificial grass installation projects.
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
          <label className="block text-sm font-medium text-gray-700">Joints length (meters)</label>
          <input
            type="number"
            value={jointsLength}
            onChange={(e) => setJointsLength(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 form-input"
            placeholder="Enter total joint length in meters"
            min="0"
            step="0.01"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700">Trim length (meters)</label>
          <p className="text-xs text-gray-500 mt-0.5 mb-2">Total length of edges that need to be trimmed</p>
          <input
            type="number"
            value={trimLength}
            onChange={(e) => setTrimLength(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 form-input"
            placeholder="Enter total trim length in meters"
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
          <label className="block text-sm font-medium text-gray-700">Sand Thickness (cm)</label>
          <input
            type="number"
            value={sandThicknessCm}
            onChange={(e) => setSandThicknessCm(e.target.value)}
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
        
        {/* Compactor Type Selection */}
        <CompactorSelector 
          selectedCompactor={selectedCompactor}
          onCompactorChange={setSelectedCompactor}
        />
        
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
        
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={calculateTransport}
            onChange={(e) => setCalculateTransport(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">Calculate transport time (default as 0.125 wheelbarrow)</span>
        </label>

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
        
        {(totalHours !== null || materials.length > 0) && (
          <div className="mt-6 space-y-4" ref={resultsRef}>
            <div>
              <h3 className="text-lg font-medium">Total Labor Hours: <span className="text-blue-600">{totalHours?.toFixed(2)} hours</span></h3>
              
              <div className="mt-2">
                <h4 className="font-medium text-gray-700 mb-2">Task Breakdown:</h4>
                <ul className="space-y-1 pl-5 list-disc">
                  {taskBreakdown.map((task, index) => (
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
    </div>
  );
};

export default ArtificialGrassCalculator;
