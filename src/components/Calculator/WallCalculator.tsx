import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { carrierSpeeds, getMaterialCapacity } from '../../constants/materialCapacity';
import { translateTaskName } from '../../lib/translationMap';

interface CalculatorProps {
  type: 'brick' | 'block4' | 'block7' | 'sleeper';
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

interface Material {
  name: string;
  amount: number;
  unit: string;
  price_per_unit: number | null;
  total_price: number | null;
}

interface MaterialFromDB {
  id: string;
  name: string;
  unit: string;
  price: number | null;
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

const WallCalculator: React.FC<CalculatorProps> = ({ 
  type, 
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
  const [layingMethod, setLayingMethod] = useState<'flat' | 'standing'>('standing');
  const [postMethod, setPostMethod] = useState<'concrete' | 'direct'>('concrete');
  const [length, setLength] = useState<string>('');
  const [height, setHeight] = useState<string>('');
  const [openings, setOpenings] = useState<string>('');
  const [result, setResult] = useState<{ 
    units: number; 
    cementBags: number;
    sandVolume: number;
    sandTonnes: number;
    rows: number; 
    roundedDownHeight: number; 
    roundedUpHeight: number;
    totalHours: number;
    taskBreakdown: { task: string; hours: number; normalizedHours?: number }[];
    materials: Material[];
  } | null>(null);
  const [transportDistance, setTransportDistance] = useState<string>('30');
  const [calculateTransport, setCalculateTransport] = useState<boolean>(false);
  const [selectedTransportCarrier, setSelectedTransportCarrier] = useState<DiggingEquipment | null>(null);
  const [carriersLocal, setCarriersLocal] = useState<DiggingEquipment[]>([]);
  const [selectedExcavator, setSelectedExcavator] = useState<DiggingEquipment | null>(null);
  const [selectedCarrier, setSelectedCarrier] = useState<DiggingEquipment | null>(null);
  const [excavators, setExcavators] = useState<DiggingEquipment[]>([]);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [includeFoundation, setIncludeFoundation] = useState<boolean>(false);
  // Foundation Calculator inputs
  const [foundationLength, setFoundationLength] = useState<string>('');
  const [foundationWidth, setFoundationWidth] = useState<string>('');
  const [foundationDepthCm, setFoundationDepthCm] = useState<string>('');
  const [foundationDiggingMethod, setFoundationDiggingMethod] = useState<'shovel' | 'small' | 'medium' | 'large'>('shovel');
  const [foundationSoilType, setFoundationSoilType] = useState<'clay' | 'sand' | 'rock'>('clay');

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
    
    if (calculateTransport) {
      fetchEquipment();
    }
  }, [calculateTransport]);

  // Fetch task templates for wall building
  const { data: taskTemplates = [], isLoading } = useQuery({
    queryKey: ['wall_tasks', type, layingMethod, companyId],
    queryFn: async () => {
      let query = supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId);

      // Add specific filters based on wall type
      if (type === 'brick') {
        query = query.ilike('name', '%bricklaying%');
      } else if (type === 'block4') {
        // More specific queries for block types
        if (layingMethod === 'standing') {
          query = query.ilike('name', '%4-inch block%standing%');
        } else {
          query = query.ilike('name', '%4-inch block%flat%');
        }
      } else if (type === 'block7') {
        if (layingMethod === 'standing') {
          query = query.ilike('name', '%7-inch block%standing%');
        } else {
          query = query.ilike('name', '%7-inch block%flat%');
        }
      } else if (type === 'sleeper') {
        query = query.or('name.ilike.%sleeper wall%,name.ilike.%digging holes%,name.ilike.%setting up posts%');
      }

      const { data, error } = await query.order('name');
      
      if (error) throw error;
      console.log('Task templates fetched:', data);
      return data;
    },
    enabled: !!companyId
  });

  // Fetch task template for preparing for the wall (leveling)
  const { data: preparingForWallTask } = useQuery({
    queryKey: ['preparing_for_wall_task', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId)
        .eq('name', 'preparing for the wall (leveling)')
        .single();
      if (error) {
        console.error('Error fetching preparing for the wall task:', error);
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

  // Fetch excavation tasks for different methods (shovel, small, medium, large excavator)
  const { data: excavationTasks = {} } = useQuery({
    queryKey: ['excavation_tasks', companyId],
    queryFn: async () => {
      if (!companyId) return {};
      
      const taskNames = [
        'Excavating foundation with shovel',
        'Excavating foundation with with small excavator',
        'Excavating foundation with with medium excavator',
        'Excavating foundation with with big excavator'
      ];

      const tasks: Record<string, TaskTemplate | null> = {};

      for (const taskName of taskNames) {
        const { data, error } = await supabase
          .from('event_tasks_with_dynamic_estimates')
          .select('id, name, unit, estimated_hours')
          .eq('company_id', companyId)
          .eq('name', taskName)
          .maybeSingle();

        if (error) {
          console.error(`Error fetching task "${taskName}":`, error);
        }
        
        if (data) {
          tasks[taskName] = {
            id: data.id || '',
            name: data.name || '',
            unit: data.unit || '',
            estimated_hours: data.estimated_hours || 0
          };
        } else {
          tasks[taskName] = null;
        }
      }

      return tasks;
    },
    enabled: !!companyId
  });

  // Fetch material usage configuration for Wall Calculator
  const { data: materialUsageConfig } = useQuery<MaterialUsageConfig[]>({
    queryKey: ['materialUsageConfig', 'wall', type, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('material_usage_configs')
        .select('calculator_id, material_id')
        .eq('calculator_id', type === 'sleeper' ? 'sleeper_wall' : 'wall')
        .eq('company_id', companyId);

      if (error) throw error;
      return data;
    },
    enabled: !!companyId
  });

  // Fetch brick/block mortar mix ratio
  const { data: brickBlockMortarMixRatioConfig } = useQuery<{ id: string; mortar_mix_ratio: string } | null>({
    queryKey: ['mortarMixRatio', 'brick', companyId],
    queryFn: async () => {
      if (!companyId) return null;

      const { data, error } = await supabase
        .from('mortar_mix_ratios')
        .select('id, mortar_mix_ratio')
        .eq('company_id', companyId)
        .eq('type', 'brick')
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "not found"
      return data;
    },
    enabled: !!companyId
  });

  // Get the material IDs from the config
  const materialIds = materialUsageConfig?.map(config => config.material_id) || [];

  // Fetch all materials that we might need based on material usage config
  const { data: materialsData } = useQuery<Material[]>({
    queryKey: ['materials', materialIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .in('id', materialIds);

      if (error) throw error;
      return data;
    },
    enabled: materialIds.length > 0
  });

  // Fetch details of the selected sand material
  const selectedSandMaterialId = materialUsageConfig?.[0]?.material_id;

  const { data: selectedSandMaterial, isLoading: isLoadingSelectedSand } = useQuery<MaterialFromDB>({
    queryKey: ['material', selectedSandMaterialId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('materials')
        .select('id, name, unit, price')
        .eq('id', selectedSandMaterialId)
        .single();

      if (error) throw error;
      return data as MaterialFromDB;
    },
    enabled: !!selectedSandMaterialId
  });

  const fetchMaterialPrices = async (materials: Material[]) => {
    try {
      const materialNames = materials.map(m => m.name);
      
      const { data, error } = await supabase
        .from('materials')
        .select('name, price')
        .in('name', materialNames);
      
      if (error) throw error;
      
      // Create a map of material names to prices
      const priceMap = data.reduce((acc: Record<string, number>, item) => {
        acc[item.name] = item.price;
        return acc;
      }, {});
      
      // Update materials with prices
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

  // Helper function to get excavation task hours from template or fallback
  const getTaskHours = (method: 'shovel' | 'small' | 'medium' | 'large', baseHours: number): number => {
    const taskMap = {
      shovel: 'Excavating foundation with shovel',
      small: 'Excavating foundation with with small excavator',
      medium: 'Excavating foundation with with medium excavator',
      large: 'Excavating foundation with with big excavator'
    };

    const taskName = taskMap[method];
    const task = excavationTasks[taskName];

    if (task && task.estimated_hours) {
      return baseHours * task.estimated_hours;
    }

    // Fallback to hardcoded values if task not found
    const MACHINE_MULTIPLIER = {
      shovel: 1,
      small: 6,
      medium: 12,
      large: 25
    };
    return baseHours / MACHINE_MULTIPLIER[method];
  };

  // Helper function to calculate foundation results
  const calculateFoundationResults = () => {
    if (!includeFoundation) return null;
    
    const lengthNum = parseFloat(foundationLength) || 0;
    const widthNum = parseFloat(foundationWidth) || 0;
    const depthNum = parseFloat(foundationDepthCm) / 100 || 0;

    if (lengthNum <= 0 || widthNum <= 0 || depthNum <= 0) {
      return null;
    }

    // Constants from FoundationCalculator
    const STANDARD_EXCAVATION = {
      length: 15,    // meters - baseline for calculation
      width: 0.6,    // meters - baseline for calculation
      depth: 0.6,    // meters - baseline for calculation
      volume: 5.4    // m³
    };

    const MANUAL_DIGGING_RATE = 0.45; // m³/hour

    // Dimension weights: how different dimensions affect digging difficulty
    // Length has most impact (50% - affects linear/lengthwise work)
    // Width has moderate impact (30% - affects lateral work)
    // Depth has least impact (20% - affects vertical digging efficiency)
    const DIMENSION_WEIGHT = {
      length: 0.5,   // 50% weight - length impacts work the most
      width: 0.3,    // 30% weight - width has moderate impact
      depth: 0.2     // 20% weight - depth has less impact due to equipment efficiency
    };

    // Soil type density (tonnes per m³) - affects how much soil is excavated
    const SOIL_DENSITY = {
      clay: 1.5,      // tonnes per m³ - denser, slower to dig
      sand: 1.6,      // tonnes per m³ - slightly denser
      rock: 2.2       // tonnes per m³ - very dense, requires more power
    };

    // Loose volume coefficients (after excavation, soil expands)
    // Soil becomes looser when excavated, taking up more space
    const LOOSE_VOLUME_COEFFICIENT = {
      clay: 1.2,      // 20% increase (1.1-1.3 average)
      sand: 1.025,    // 2.5% increase (1.0-1.05 average) - more compact
      rock: 1.075     // 7.5% increase (1.05-1.1 average)
    };

    // Concrete mix ratios (per m³) for foundation
    const CONCRETE_MIX = {
      cement: 350,    // kg per m³
      sand: 700,      // kg per m³
      aggregate: 1050 // kg per m³
    };

    // Calculate actual volume
    const actualVolume = lengthNum * widthNum * depthNum;

    // Calculate relative coefficients
    const lengthRel = lengthNum / STANDARD_EXCAVATION.length;
    const widthRel = widthNum / STANDARD_EXCAVATION.width;
    const depthRel = depthNum / STANDARD_EXCAVATION.depth;

    // Calculate time with dimension weights
    const timeBaseManual = actualVolume / MANUAL_DIGGING_RATE;
    const dimensionAdjustment = 
      (DIMENSION_WEIGHT.length * lengthRel) +
      (DIMENSION_WEIGHT.width * widthRel) +
      (DIMENSION_WEIGHT.depth * depthRel);
    const timeWithDimensions = timeBaseManual * dimensionAdjustment;

    // Get final time using task template or fallback
    const excavationHours = getTaskHours(foundationDiggingMethod, timeWithDimensions);

    // Calculate material weight (excavated soil)
    const soilDensity = SOIL_DENSITY[foundationSoilType];
    
    // Calculate loose volume after excavation (soil expands)
    const looseVolumeCoefficient = LOOSE_VOLUME_COEFFICIENT[foundationSoilType];
    const looseVolume = actualVolume * looseVolumeCoefficient;

    // Calculate concrete components
    const aggregateKg = actualVolume * CONCRETE_MIX.aggregate;
    const aggregateTonnes = aggregateKg / 1000;

    // Build task breakdown (single excavation task)
    // Map digging method to actual task name
    const taskNameMap = {
      'shovel': 'Excavating foundation with shovel',
      'small': 'Excavating foundation with with small excavator',
      'medium': 'Excavating foundation with with medium excavator',
      'large': 'Excavating foundation with with big excavator'
    };
    const taskName = taskNameMap[foundationDiggingMethod];

    const breakdown = [
      {
        task: taskName,
        hours: excavationHours
      }
    ];

    // Build materials list
    const materialsList = [
      { 
        name: `Excavated ${foundationSoilType.charAt(0).toUpperCase() + foundationSoilType.slice(1)} Soil (loose volume)`, 
        amount: looseVolume * soilDensity, 
        unit: 'tonnes',
        price_per_unit: null,
        total_price: null
      },
      { 
        name: 'Aggregate (for concrete)', 
        amount: aggregateTonnes, 
        unit: 'tonnes',
        price_per_unit: null,
        total_price: null
      }
    ];

    return {
      hours: excavationHours,
      taskBreakdown: breakdown,
      materials: materialsList,
      diggingMethod: foundationDiggingMethod
    };
  };

  const calculate = async () => {
    const l = parseFloat(length);
    const h = parseFloat(height);
    const o = parseFloat(openings) || 0;

    if (isNaN(l) || isNaN(h)) {
      return;
    }

    let area = (l * h) - o;
    let units = 0;
    let mortarVolume = 0;

    // Constants for mortar components
    const cementDensity = 1500; // kg/m³
    const sandDensity = 1600; // kg/m³
    
    // Get configurable mortar mix ratio
    const mortarMixRatio = brickBlockMortarMixRatioConfig?.mortar_mix_ratio || '1:4';
    const { cementProportion, sandProportion } = getMortarMixRatioProportion(mortarMixRatio);

    const brickHeight = 0.06; // Brick height in meters
    const brickLength = 0.215; // Brick length in meters (21.5 cm)
    const mortarThickness = 0.01; // Mortar thickness in meters
    const totalRowHeight = brickHeight + mortarThickness;

    let blockHeight = 0.22; // Default block height
    let blockWidth = 0;
    let blockLength = 0.44; // Block length in meters

    if (type === 'block4') {
      blockWidth = 0.10;
    } else if (type === 'block7') {
      blockWidth = 0.14;
    }
    
    if (type === 'block4' || type === 'block7') {
      if (layingMethod === 'flat') {
        blockHeight = blockWidth;
      }
    }

    let blocksPerSquareMeter = 1 / ((blockHeight + mortarThickness) * (blockLength + mortarThickness));
    
    switch (type) {
      case 'brick':
        // Calculate rows and round up
        const brickRows = Math.ceil(h / (brickHeight + mortarThickness));
        // Bricks per row: total wall length / (brick length + mortar thickness)
        const bricksPerRow = Math.ceil(l / (brickLength + mortarThickness));
        units = brickRows * bricksPerRow;
        // Mortar per brick + 20% extra: 0.000269 m³ (per brick)
        mortarVolume = units * 0.000269;
        break;
      case 'block4':
        // Calculate rows and round up
        const blockRows4 = Math.ceil(h / (blockHeight + mortarThickness));
        // Blocks per row: total wall length / (block length + mortar thickness)
        const blocksPerRow4 = Math.ceil(l / (blockLength + mortarThickness));
        units = blockRows4 * blocksPerRow4;
        // Mortar per block (standing or flat) + 20% extra
        const mortarPerBlock4 = layingMethod === 'flat' ? 0.001452 : 0.000871;
        mortarVolume = units * mortarPerBlock4;
        break;
      case 'block7':
        // Calculate rows and round up
        const blockRows7 = Math.ceil(h / (blockHeight + mortarThickness));
        // Blocks per row: total wall length / (block length + mortar thickness)
        const blocksPerRow7 = Math.ceil(l / (blockLength + mortarThickness));
        units = blockRows7 * blocksPerRow7;
        // Mortar per block (standing or flat) + 20% extra
        const mortarPerBlock7 = layingMethod === 'flat' ? 0.001531 : 0.001109;
        mortarVolume = units * mortarPerBlock7;
        break;
      case 'sleeper':
        // Calculate sleepers needed
        const sleeperLength = 2.4; // 2400mm = 2.4m
        const sleeperHeight = 0.2; // 200mm = 0.2m
        
        // Calculate sleepers per row and number of rows
        const sleepersPerRow = Math.ceil(l / sleeperLength);
        const numberOfRows = Math.ceil(h / sleeperHeight);
        units = sleepersPerRow * numberOfRows;
        
        // Calculate posts needed (1 at start + 2 for each sleeper in first row)
        const postsNeeded = 1 + (sleepersPerRow * 2);
        
        // Calculate actual height after rounding up rows
        const roundedUpHeight = numberOfRows * sleeperHeight;
        
        // Prepare task breakdown
        const taskBreakdown = [];
        
        // Add first layer task
        const firstLayerTask = taskTemplates.find(t => 
          t.name.toLowerCase().includes('sleeper wall') && 
          t.name.toLowerCase().includes('1st layer')
        );
        if (firstLayerTask) {
          taskBreakdown.push({
            task: firstLayerTask.name,
            hours: firstLayerTask.estimated_hours * sleepersPerRow,
            amount: sleepersPerRow,
            unit: 'sleepers'
          });
        }
        
        // Add additional layers task
        if (numberOfRows > 1) {
          const regularLayerTask = taskTemplates.find(t => {
            const name = t.name.toLowerCase();
            // Look for "building a sleeper wall (on top of 1st layer)" or similar
            // Match by looking for "(on top" in the name
            return name.includes('sleeper wall') && name.includes('on top');
          });
          if (regularLayerTask) {
            const additionalSleepers = units - sleepersPerRow;
            taskBreakdown.push({
              task: regularLayerTask.name,
              hours: regularLayerTask.estimated_hours * additionalSleepers,
              amount: additionalSleepers,
              unit: 'sleepers'
            });
          }
        }
        
        // Add post-related tasks
        if (postMethod === 'concrete') {
          const diggingTask = taskTemplates.find(t => 
            t.name.toLowerCase().includes('digging holes')
          );
          if (diggingTask) {
            taskBreakdown.push({
              task: diggingTask.name,
              hours: diggingTask.estimated_hours * postsNeeded,
              amount: postsNeeded,
              unit: 'holes'
            });
          }
        }
        
        const settingPostsTask = taskTemplates.find(t => 
          t.name.toLowerCase().includes('setting up posts')
        );
        if (settingPostsTask) {
          taskBreakdown.push({
            task: settingPostsTask.name,
            hours: settingPostsTask.estimated_hours * postsNeeded,
            amount: postsNeeded,
            unit: 'posts'
          });
        }
        
        // Calculate total hours
        const totalHours = taskBreakdown.reduce((sum, task) => sum + task.hours, 0);

        // Add transport tasks if enabled
        if (calculateTransport) {
          let carrierSizeForTransport = 0.125;
          
          if (selectedTransportCarrier) {
            carrierSizeForTransport = selectedTransportCarrier["size (in tones)"] || 0.125;
          }

          // Calculate sleepers transport - on foot, 1 per trip
          if (units > 0) {
            const sleepersPerTrip = 1;
            const sleeperTrips = Math.ceil(units / sleepersPerTrip);
            const sleeperCarrySpeed = 1500; // m/h for foot carrying
            const sleeperTimePerTrip = (parseFloat(transportDistance) || 30) * 2 / sleeperCarrySpeed;
            const sleeperTransportTime = sleeperTrips * sleeperTimePerTrip;
            
            if (sleeperTransportTime > 0) {
              taskBreakdown.push({
                task: 'transport sleepers',
                hours: sleeperTransportTime,
                amount: units,
                unit: 'sleepers'
              });
            }
          }

          // Calculate posts transport - on foot, 1 per trip
          if (postsNeeded > 0) {
            const postsPerTrip = 1;
            const postTrips = Math.ceil(postsNeeded / postsPerTrip);
            const postCarrySpeed = 1500; // m/h for foot carrying
            const postTimePerTrip = (parseFloat(transportDistance) || 30) * 2 / postCarrySpeed;
            const postTransportTime = postTrips * postTimePerTrip;
            
            if (postTransportTime > 0) {
              taskBreakdown.push({
                task: 'transport posts',
                hours: postTransportTime,
                amount: postsNeeded,
                unit: 'posts'
              });
            }
          }

          // Calculate postmix transport - bags via carrier
          if (postMethod === 'concrete') {
            const postmixBags = postsNeeded * 2;
            if (postmixBags > 0) {
              const postmixResult = calculateMaterialTransportTime(postmixBags, carrierSizeForTransport, 'cement', parseFloat(transportDistance) || 30);
              const postmixTransportTime = postmixResult.totalTransportTime;
              
              if (postmixTransportTime > 0) {
                taskBreakdown.push({
                  task: 'transport postmix',
                  hours: postmixTransportTime,
                  amount: postmixBags,
                  unit: 'bags'
                });
              }
            }
          }
        }

        // Recalculate total hours with transport
        const finalTotalHours = taskBreakdown.reduce((sum, task) => sum + task.hours, 0);
        
        // Prepare materials list with hardcoded names
        const materials: Material[] = [
          { name: 'Sleepers', amount: units, unit: 'sleepers', price_per_unit: null, total_price: null },
          { name: 'Post', amount: postsNeeded, unit: 'posts', price_per_unit: null, total_price: null }
        ];

        // Add concrete if needed
        if (postMethod === 'concrete') {
          materials.push({ 
            name: 'Postmix', 
            amount: postsNeeded * 2, 
            unit: 'bags', 
            price_per_unit: null, 
            total_price: null 
          });
        }

        // Fetch material prices
        const materialsWithPrices = await fetchMaterialPrices(materials);
        
        // Set the result
        setResult({
          units,
          cementBags: 0,
          sandVolume: 0,
          sandTonnes: 0,
          rows: numberOfRows,
          roundedDownHeight: h,
          roundedUpHeight,
          totalHours: finalTotalHours,
          taskBreakdown,
          materials: materialsWithPrices
        });
        
        // Notify parent component of results
        if (onResultsChange) {
          onResultsChange({
            name: 'Sleeper Wall',
            totalHours: finalTotalHours,
            taskBreakdown,
            materials,
            labor: finalTotalHours
          });
        }
        
        return;
    }

    // Calculate cement and sand quantities
    const cementVolume = mortarVolume * cementProportion;
    const sandVolume = mortarVolume * sandProportion;
    
    // Convert cement volume to bags (1 bag = 25kg)
    const cementWeight = cementVolume * cementDensity;
    const cementBags = Math.ceil(cementWeight / 25);
    
    // Convert sand volume to tonnes (using sand density)
    const sandTonnes = sandVolume * sandDensity / 1000; // Convert kg to tonnes

    // Get transport distance in meters
    const transportDistanceMeters = parseFloat(transportDistance) || 30;

    // Calculate material transport times if "Calculate transport time" is checked
    let brickTransportTime = 0;
    let blockTransportTime = 0;
    let sandTransportTime = 0;
    let cementTransportTime = 0;
    let normalizedBrickTransportTime = 0;
    let normalizedBlockTransportTime = 0;
    let normalizedSandTransportTime = 0;
    let normalizedCementTransportTime = 0;

    if (calculateTransport) {
      let carrierSizeForTransport = 0.125;
      
      if (selectedTransportCarrier) {
        carrierSizeForTransport = selectedTransportCarrier["size (in tones)"] || 0.125;
      }

      // Calculate brick/block transport
      let materialType = 'bricks';
      if (type === 'block4' || type === 'block7') {
        materialType = 'blocks';
      }
      
      if (units > 0) {
        const unitResult = calculateMaterialTransportTime(units, carrierSizeForTransport, materialType, transportDistanceMeters);
        if (type === 'brick') {
          brickTransportTime = unitResult.totalTransportTime;
          normalizedBrickTransportTime = unitResult.normalizedTransportTime;
        } else {
          blockTransportTime = unitResult.totalTransportTime;
          normalizedBlockTransportTime = unitResult.normalizedTransportTime;
        }
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

    const rows = h / (blockHeight + mortarThickness);
    const roundedDownHeight = Math.floor(rows) * (blockHeight + mortarThickness);
    const roundedUpHeight = Math.ceil(rows) * (blockHeight + mortarThickness);

    // Calculate time estimates
    let totalHours = 0;
    const taskBreakdown: { task: string; hours: number; normalizedHours?: number }[] = [];

    if (taskTemplates && taskTemplates.length > 0) {
      let relevantTask;

      if (type === 'brick') {
        relevantTask = taskTemplates[0]; // Bricklaying task
      } else {
        // Improved task selection for blocks with better matching
        const blockType = type === 'block4' ? '4-inch' : '7-inch';
        
        // First try to find an exact match
        relevantTask = taskTemplates.find(task => 
          task.name.toLowerCase().includes(blockType.toLowerCase()) && 
          task.name.toLowerCase().includes(layingMethod.toLowerCase())
        );
        
        // If no exact match, try just the block type
        if (!relevantTask && taskTemplates.length > 0) {
          relevantTask = taskTemplates.find(task => 
            task.name.toLowerCase().includes(blockType.toLowerCase())
          );
        }
        
        // Last resort: just use the first task in the list
        if (!relevantTask && taskTemplates.length > 0) {
          relevantTask = taskTemplates[0];
        }
      }

      console.log('Selected task:', relevantTask); // Add logging to debug

      if (relevantTask && relevantTask.estimated_hours) {
        const taskHours = units * relevantTask.estimated_hours;
        totalHours = taskHours;
        taskBreakdown.push({
          task: relevantTask.name,
          hours: taskHours
        });

        // Add transport tasks if applicable
        if (calculateTransport && (type === 'brick' && brickTransportTime > 0)) {
          taskBreakdown.push({
            task: 'transport bricks',
            hours: brickTransportTime,
            normalizedHours: normalizedBrickTransportTime
          });
        } else if (calculateTransport && ((type === 'block4' || type === 'block7') && blockTransportTime > 0)) {
          taskBreakdown.push({
            task: 'transport blocks',
            hours: blockTransportTime,
            normalizedHours: normalizedBlockTransportTime
          });
        }

        if (calculateTransport && sandTransportTime > 0) {
          taskBreakdown.push({
            task: 'transport sand',
            hours: sandTransportTime,
            normalizedHours: normalizedSandTransportTime
          });
        }

        if (calculateTransport && cementTransportTime > 0) {
          taskBreakdown.push({
            task: 'transport cement',
            hours: cementTransportTime,
            normalizedHours: normalizedCementTransportTime
          });
        }

        // Add preparing for the wall (leveling) task if available and foundation is NOT included
        if (!includeFoundation && preparingForWallTask && preparingForWallTask.estimated_hours !== undefined) {
          const lengthNum = parseFloat(length) || 0;
          taskBreakdown.push({
            task: 'preparing for the wall (leveling)',
            hours: lengthNum * preparingForWallTask.estimated_hours,
            event_task_id: preparingForWallTask.id
          });
          totalHours += lengthNum * preparingForWallTask.estimated_hours;
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
            taskBreakdown.push({
              task: 'mixing mortar',
              hours: numberOfBatches * mixingMortarTask.estimated_hours,
              event_task_id: mixingMortarTask.id
            });
            totalHours += numberOfBatches * mixingMortarTask.estimated_hours;
          }
        }

        totalHours += brickTransportTime + blockTransportTime + sandTransportTime + cementTransportTime;
      } else {
        console.log('No estimated hours found for task'); // Add logging to debug
      }
    } else {
      console.log('No task templates found'); // Add logging to debug
    }

    // Prepare materials list
    const materials: Material[] = [
      { name: 'Cement', amount: cementBags, unit: 'bags', price_per_unit: null, total_price: null },
      { name: selectedSandMaterial?.name || 'Sand', amount: Number(sandTonnes.toFixed(2)), unit: 'tonnes', price_per_unit: selectedSandMaterial?.price || null, total_price: null }
    ];

    // Add specific materials based on wall type
    if (type === 'brick') {
      materials.push({ name: 'Bricks', amount: units, unit: 'pieces', price_per_unit: null, total_price: null });
    } else {
      const blockType = type === 'block4' ? '4-inch blocks' : '7-inch blocks';
      materials.push({ name: blockType, amount: units, unit: 'pieces', price_per_unit: null, total_price: null });
    }

    // Add foundation materials if included
    if (includeFoundation) {
      const foundationData = calculateFoundationResults();
      if (foundationData) {
        // Add foundation materials to the list
        materials.push(...foundationData.materials);
        // Add foundation hours to total
        totalHours += foundationData.hours;
        // Add foundation task breakdown
        taskBreakdown.push(...foundationData.taskBreakdown);
      }
    }

    // Fetch material prices
    const materialsWithPrices = await fetchMaterialPrices(materials);

    setResult({
      units,
      cementBags,
      sandVolume: Number(sandVolume.toFixed(3)),
      sandTonnes: Number(sandTonnes.toFixed(2)),
      rows: Number(rows.toFixed(2)),
      roundedDownHeight: Number(roundedDownHeight.toFixed(2)),
      roundedUpHeight: Number(roundedUpHeight.toFixed(2)),
      totalHours,
      taskBreakdown,
      materials: materialsWithPrices
    });
  };

  // Add effect to expose results
  useEffect(() => {
    if (result && onResultsChange) {
      // Format results for database storage
      const formattedResults = {
        name: `${type === 'brick' ? 'Brick' : type === 'block4' ? '4-inch Block' : '7-inch Block'} Wall`,
        amount: result.units,  // Changed to just the number
        unit: 'pieces',        // Added unit separately
        hours_worked: result.totalHours,
        includeFoundation,     // Pass foundation flag to ProjectCreating
        ...(includeFoundation && { diggingMethod: foundationDiggingMethod }), // Pass digging method for Foundation Excavation task matching
        materials: result.materials.map(material => ({
          name: material.name,
          quantity: material.amount,
          unit: material.unit
        })),
        taskBreakdown: result.taskBreakdown.map(item => ({
          task: item.task,     // Changed 'name' to 'task' to match expected format
          hours: item.hours,
          amount: result.units,  // Added amount
          unit: 'pieces'         // Added unit
        }))
      };

      // Store results in a data attribute for the modal to access
      const calculatorElement = document.querySelector('[data-calculator-results]');
      if (calculatorElement) {
        calculatorElement.setAttribute('data-calculator-results', JSON.stringify(formattedResults));
      }

      // Notify parent component of results
      onResultsChange(formattedResults);
    }
  }, [result, type, onResultsChange]);

  // Scroll to results when they appear
  useEffect(() => {
    if (result && resultsRef.current) {
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
  }, [result]);

  return (
    <div className="space-y-4">
      {type === 'sleeper' ? (
        <div>
          <div className="flex space-x-2 mb-4">
            <button
              className={`px-4 py-2 rounded-md text-white ${postMethod === 'concrete' ? 'bg-blue-600' : 'bg-gray-700'}`}
              onClick={() => setPostMethod('concrete')}
            >
              Concrete in Posts
            </button>
            <button
              className={`px-4 py-2 rounded-md text-white ${postMethod === 'direct' ? 'bg-blue-600' : 'bg-gray-700'}`}
              onClick={() => setPostMethod('direct')}
            >
              Drive Posts Directly
            </button>
          </div>
        </div>
      ) : (
        (type === 'block4' || type === 'block7') && (
          <div className="flex space-x-2">
            <button
              className={`px-4 py-2 rounded-md text-white ${layingMethod === 'standing' ? 'bg-blue-600' : 'bg-gray-700'}`}
              onClick={() => setLayingMethod('standing')}
            >
              Standing
            </button>
            <button
              className={`px-4 py-2 rounded-md text-white ${layingMethod === 'flat' ? 'bg-blue-600' : 'bg-gray-700'}`}
              onClick={() => setLayingMethod('flat')}
            >
              Flat
            </button>
          </div>
        )
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700">{t('calculator:wall_length_label')}</label>
        <input
          type="number"
          value={length}
          onChange={(e) => setLength(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">{t('calculator:wall_height_label')}</label>
        <input
          type="number"
          value={height}
          onChange={(e) => setHeight(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">{t('calculator:openings_area_label')}</label>
        <input
          type="number"
          value={openings}
          onChange={(e) => setOpenings(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        />
      </div>
      
      {/* Foundation Calculator Tickbox - Only show for brick, block4, block7 */}
      {type !== 'sleeper' && (
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={includeFoundation}
            onChange={(e) => setIncludeFoundation(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">{t('calculator:include_foundation')}</span>
        </label>
      )}

      {/* Foundation Calculator Inputs - Only show if tickbox is checked */}
      {includeFoundation && type !== 'sleeper' && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">{t('calculator:foundation_details_label')}</h3>
          
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">{t('calculator:input_length_in_cm')}</label>
              <input
                type="number"
                value={foundationLength}
                onChange={(e) => setFoundationLength(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder={t('calculator:placeholder_enter_length_m')}
                min="0"
                step="0.1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">{t('calculator:input_width_in_cm')}</label>
              <input
                type="number"
                value={foundationWidth}
                onChange={(e) => setFoundationWidth(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder={t('calculator:placeholder_enter_width')}
                min="0"
                step="0.1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">{t('calculator:input_depth_in_cm')}</label>
              <input
                type="number"
                value={foundationDepthCm}
                onChange={(e) => setFoundationDepthCm(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder={t('calculator:placeholder_enter_depth_cm')}
                min="0"
                step="1"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">{t('calculator:digging_method')}</label>
            <select
              value={foundationDiggingMethod}
              onChange={(e) => setFoundationDiggingMethod(e.target.value as any)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="shovel">Shovel (Manual)</option>
              <option value="small">Small Excavator (1-3t)</option>
              <option value="medium">Medium Excavator (3-7t)</option>
              <option value="large">Large Excavator (7+t)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">{t('calculator:soil_type')}</label>
            <select
              value={foundationSoilType}
              onChange={(e) => setFoundationSoilType(e.target.value as any)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="clay">Clay</option>
              <option value="sand">Sand</option>
              <option value="rock">Rock</option>
            </select>
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
        <span className="text-sm font-medium text-gray-700">{t('calculator:calculate_transport_time_label')}</span>
      </label>

      {/* Transport Carrier Selection */}
      {calculateTransport && (
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

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('calculator:transport_distance_label')}</label>
              <input
                type="number"
                value={transportDistance}
                onChange={(e) => setTransportDistance(e.target.value)}
                className="w-full p-2 border rounded-md"
                placeholder={t('calculator:placeholder_enter_transport_distance')}
                min="0"
                step="1"
              />
            </div>
          </div>
        )}
      
      <button
        onClick={calculate}
        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
      >
        {t('calculator:calculate_button')}
      </button>
      {result && (
        <div className="mt-6 space-y-4" ref={resultsRef}>
          <div>
            <div className="mt-2 space-y-2">
              <p>
                Total Rows: <span className="font-bold">{Math.ceil(result.rows)}</span> <span className="text-sm text-blue-600 font-semibold">(Rounded Up from {result.rows.toFixed(2)})</span>
              </p>
              <p>
                Rounded Up Height: <span className="font-bold">{result.roundedUpHeight} m</span>
              </p>
            </div>

            <h3 className="text-lg font-medium mt-4">{t('calculator:total_labor_hours_label')} <span className="text-blue-600">{result.totalHours.toFixed(2)} {t('calculator:hours_abbreviation')}</span></h3>
            
            <div className="mt-2">
              <h4 className="font-medium text-gray-700 mb-2">{t('calculator:task_breakdown_label')}</h4>
              <ul className="space-y-1 pl-5 list-disc">
                {result.taskBreakdown.map((task, index) => (
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
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                      Material
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                      Quantity
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                      Unit
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                      Price per Unit
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                      Total Price
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {result.materials.map((material, index) => (
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
                  <tr className="bg-gray-700">
                    <td colSpan={4} className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white text-right">
                      Total Cost:
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-white">
                      {result.materials.reduce((sum, material) => sum + (material.total_price || 0), 0).toFixed(2) !== '0.00' 
                        ? `£${result.materials.reduce((sum, material) => sum + (material.total_price || 0), 0).toFixed(2)}`
                        : 'N/A'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WallCalculator;
