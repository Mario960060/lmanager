import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { carrierSpeeds, getMaterialCapacity } from '../../constants/materialCapacity';
import { translateTaskName } from '../../lib/translationMap';
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
  const { t } = useTranslation(['calculator', 'utilities', 'common']);
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
  const [soilTransportDistance, setSoilTransportDistance] = useState<string>('30');
  const [tape1TransportDistance, setTape1TransportDistance] = useState<string>('30');
  const [materialTransportDistance, setMaterialTransportDistance] = useState<string>('30'); // For sand transport
  const [calculateTransport, setCalculateTransport] = useState<boolean>(false);
  const [selectedTransportCarrier, setSelectedTransportCarrier] = useState<DiggingEquipment | null>(null);
  const [transportDistance, setTransportDistance] = useState<string>('30'); // Local state for transport distance
  const [selectedCompactor, setSelectedCompactor] = useState<CompactorOption | null>(null);

  // Use carriers from props if available (from ProjectCreating), otherwise use local state
  const carriers = propCarriers && propCarriers.length > 0 ? propCarriers : carriersLocal;

  // Fetch task template for artificial grass laying
  const { data: layingTask, isLoading } = useQuery({
    queryKey: ['artificial_grass_laying_task', companyId || 'no-company'],
    queryFn: async () => {
      if (!companyId) throw new Error('No company ID');
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
  }, [transportDistance, isInProjectCreating, propSetTransportDistance]);

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

  const calculate = async () => {
    if (!area || !tape1ThicknessCm || !sandThicknessCm) {
      setCalculationError(t('calculator:fill_all_required_fields'));
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
      
      if (layingTask?.unit && layingTask?.estimated_hours !== undefined && layingTask?.estimated_hours !== null) {
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
      const transportDistanceMeters = parseFloat(materialTransportDistance) || 30;

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

      console.log('DEBUG: ArtificialGrassCalculator - Initial breakdown:', JSON.parse(JSON.stringify(breakdown)));

      // Add sand screeding task if available
      if (sandScreedingTask && sandScreedingTask.estimated_hours !== undefined && sandScreedingTask.estimated_hours !== null) {
        console.log('DEBUG: Adding sand screeding task:', sandScreedingTask);
        breakdown.push({
          task: 'sand screeding',
          hours: areaNum * sandScreedingTask.estimated_hours,
          amount: areaNum.toString(),
          unit: 'square meters'
        });
      }

      // Add jointing artificial grass task if available and jointsLength is provided
      const jointsLengthNum = parseFloat(jointsLength);
      if (jointingTask && jointingTask.estimated_hours !== undefined && jointingTask.estimated_hours !== null && jointsLength && !isNaN(jointsLengthNum) && jointsLengthNum > 0) {
        console.log('DEBUG: Adding jointing task:', jointingTask);
        breakdown.push({
          task: 'jointing artificial grass',
          hours: jointsLengthNum * jointingTask.estimated_hours,
          amount: jointsLengthNum.toString(),
          unit: 'meters'
        });
      }

      // Add trimming edges artificial grass task if available and trimLength is provided
      const trimLengthNum = parseFloat(trimLength);
      if (trimmingEdgesTask && trimmingEdgesTask.estimated_hours !== undefined && trimmingEdgesTask.estimated_hours !== null && trimLength && !isNaN(trimLengthNum) && trimLengthNum > 0) {
        console.log('DEBUG: Adding trimming edges task:', trimmingEdgesTask);
        breakdown.push({
          task: 'trimming edges (artificial grass)',
          hours: trimLengthNum * trimmingEdgesTask.estimated_hours,
          amount: trimLengthNum.toString(),
          unit: 'meters'
        });
      }

      // Add final leveling sand task if available
      if (finalLevelingSandTask && finalLevelingSandTask.estimated_hours !== undefined && finalLevelingSandTask.estimated_hours !== null) {
        console.log('DEBUG: Adding final leveling sand task:', finalLevelingSandTask);
        breakdown.push({
          task: 'final leveling (sand)',
          hours: areaNum * finalLevelingSandTask.estimated_hours,
          amount: areaNum.toString(),
          unit: 'square meters'
        });
      }

      console.log('DEBUG: ArtificialGrassCalculator - Final breakdown:', JSON.parse(JSON.stringify(breakdown)));

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
      setCalculationError(t('calculator:calculation_error'));
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
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">{t('calculator:artificial_grass_installation_calculator_title')}</h2>
      <p className="text-sm text-gray-600">
        Calculate materials, time, and costs for artificial grass installation projects.
      </p>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">{t('calculator:input_area_m2')}</label>
          <input
            type="number"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 form-input"
            placeholder={t('calculator:placeholder_enter_area_m2')}
            min="0"
            step="0.01"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700">{t('calculator:input_total_joint_length_m')}</label>
          <input
            type="number"
            value={jointsLength}
            onChange={(e) => setJointsLength(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 form-input"
            placeholder={t('calculator:placeholder_enter_joint_length')}
            min="0"
            step="0.01"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700">{t('calculator:input_total_trim_length_m')}</label>
          <p className="text-xs text-gray-500 mt-0.5 mb-2">{t('calculator:total_length_edges_trimmed')}</p>
          <input
            type="number"
            value={trimLength}
            onChange={(e) => setTrimLength(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 form-input"
            placeholder={t('calculator:placeholder_enter_trim_length')}
            min="0"
            step="0.01"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700">{t('calculator:input_type1_thickness_cm')}</label>
          <input
            type="number"
            value={tape1ThicknessCm}
            onChange={(e) => setTape1ThicknessCm(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 form-input"
            placeholder={t('calculator:placeholder_enter_thickness')}
            min="0"
            step="0.5"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700">{t('calculator:input_sand_thickness_cm')}</label>
          <input
            type="number"
            value={sandThicknessCm}
            onChange={(e) => setSandThicknessCm(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 form-input"
            placeholder={t('calculator:placeholder_enter_thickness')}
            min="0"
            step="0.5"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700">{t('calculator:input_additional_soil_depth_cm')}</label>
          <input
            type="number"
            value={soilExcessCm}
            onChange={(e) => setSoilExcessCm(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 form-input"
            placeholder={t('calculator:placeholder_enter_depth_cm')}
            min="0"
            step="0.5"
          />
          <p className="text-xs text-gray-500 mt-1">{t('calculator:additional_soil_depth_desc')}</p>
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
            <span className="text-sm font-medium text-gray-700">{t('calculator:calculate_digging_prep')}</span>
            </label>
          </div>
        )}

        {/* Equipment Selection */}
        {calculateDigging && (
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">{t('calculator:excavation_machinery')}</label>
              <div className="space-y-2">
                {excavators.length === 0 ? (
                  <p className="text-gray-500">{t('calculator:no_excavators_found')}</p>
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
              <label className="block text-sm font-medium text-gray-700 mb-3">{t('calculator:carrier_machinery')}</label>
              <div className="space-y-2">
                {carriers.length === 0 ? (
                  <p className="text-gray-500">{t('calculator:no_carriers_found')}</p>
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

        {/* Transport Distance for Soil and Tape1 */}
        {calculateDigging && selectedCarrier && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('calculator:transport_distance_label')}</label>
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
            <p className="text-xs text-gray-500 mt-1">{t('calculator:set_to_zero_no_transporting')}</p>
          </div>
        )}
        
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={calculateTransport}
            onChange={(e) => setCalculateTransport(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">{t('calculator:calculate_transport_time_label')}</span>
        </label>

        {/* Transport Carrier Selection */}
        {calculateTransport && (
          <>
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

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('calculator:transport_distance_label')}</label>
              <input
                type="number"
                value={materialTransportDistance}
                onChange={(e) => setMaterialTransportDistance(e.target.value)}
                className="w-full p-2 border rounded-md"
                placeholder={t('calculator:placeholder_enter_material_transport')}
                min="0"
                step="1"
              />
              <p className="text-xs text-gray-500 mt-1">{t('calculator:distance_transporting_materials')}</p>
            </div>
          </>
        )}
        
        <button
          onClick={calculate}
          disabled={isLoading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors disabled:bg-blue-300"
        >
          {isLoading ? t('calculator:loading_in_progress') : t('calculator:calculate_button')}
        </button>
        
        {calculationError && (
          <div className="p-3 bg-red-50 text-red-700 rounded-md">
            {calculationError}
          </div>
        )}
        
        {(totalHours !== null || materials.length > 0) && (
          <div className="mt-6 space-y-4" ref={resultsRef}>
            <div>
              <h3 className="text-lg font-medium">{t('calculator:total_labor_hours_label')} <span className="text-blue-600">{totalHours?.toFixed(2)} {t('calculator:hours_abbreviation')}</span></h3>
              
              <div className="mt-2">
                <h4 className="font-medium text-gray-700 mb-2">{t('calculator:task_breakdown_label')}</h4>
                <ul className="space-y-1 pl-5 list-disc">
                  {taskBreakdown.map((task, index) => (
                    <li key={index} className="text-sm">
                      <span className="font-medium">{translateTaskName(task.task, t)}:</span> {task.hours.toFixed(2)} hours
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            
            <div>
              <h3 className="font-medium mb-2">{t('calculator:materials_required_label')}</h3>
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
