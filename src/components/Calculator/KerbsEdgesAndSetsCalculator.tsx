import React, { useState, useEffect, useRef, ChangeEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import KerbVisualization from './KerbVisualization';
import { carrierSpeeds, getMaterialCapacity } from '../../constants/materialCapacity';
import { translateTaskName, translateUnit } from '../../lib/translationMap';
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
  DataTable,
} from '../../themes/uiComponents';

interface CalculatorProps {
  onResultsChange?: (results: CalculationResults) => void;
  onInputsChange?: (inputs: Record<string, any>) => void;
  type: KerbType;
  isInProjectCreating?: boolean;
  initialLength?: number;
  savedInputs?: Record<string, any>;
  calculateTransport?: boolean;
  setCalculateTransport?: (value: boolean) => void;
  selectedTransportCarrier?: any;
  setSelectedTransportCarrier?: (value: any) => void;
  transportDistance?: string;
  setTransportDistance?: (value: string) => void;
  carriers?: any[];
  selectedExcavator?: any;
  recalculateTrigger?: number;
}

interface MaterialUsageConfig {
  calculator_id: string;
  material_id: string;
}

interface Material {
  name: string;
  amount: number;
  unit: string;
  price_per_unit: number | null;
  total_price: number | null;
}

interface MaterialResult {
  name: string;
  quantity: number;
  unit: string;
  price_per_unit?: number | null;
  total_price?: number | null;
}

interface TaskBreakdown {
  task: string;
  hours: number;
  amount: number;
  unit: string;
}

interface DiggingEquipment {
  id: string;
  name: string;
  'size (in tones)': number;
}

interface CalculationResults {
  name: string;
  amount: number;
  unit: string;
  hours_worked: number;
  materials: MaterialResult[];
  taskBreakdown: {
    task?: string;
    name?: string;
    hours: number;
    amount?: number | string;
    unit: string;
    quantity?: number;
    normalizedHours?: number;
    event_task_id?: string | null;
  }[];
}

type KerbType = 'kl' | 'rumbled' | 'flat' | 'sets';
type HunchType = 'full-both' | 'half-both' | 'small-both' | 'full-half' | 'full-small' | 'half-small';

type KerbDimensions = {
  length: number;
  height: number;
  width: number;
};

const KERB_NAMES = {
  kl: 'KL kerbs',
  rumbled: 'Rumbled kerbs',
  flat: 'Flat edges',
  sets: 'Sets'
} as const;

const KERB_DIMENSIONS = {
  kl: { length: 10, height: 20, width: 10 } as const,
  rumbled: {
    flat: { length: 20, height: 15, width: 8 } as const,
    standing: { length: 15, height: 20, width: 8 } as const
  } as const,
  flat: { length: 100, height: 15, width: 5 } as const, // default, overridden by selectedFlatDimensions
  sets: { length: 10, height: 5, width: 10 } as const
} as const;

const FLAT_EDGE_DIMENSION_OPTIONS: readonly KerbDimensions[] = [
  { length: 100, height: 15, width: 5 },
  { length: 100, height: 20, width: 5 }
] as const;

const SETS_DIMENSION_OPTIONS: readonly KerbDimensions[] = [
  { length: 20, width: 10, height: 5 },
  { length: 10, width: 10, height: 5 }
] as const;

const KL_DIMENSION_OPTIONS: readonly KerbDimensions[] = [
  { length: 10, height: 20, width: 10 }
] as const;

const RUMBLED_FLAT_DIMENSION_OPTIONS: readonly KerbDimensions[] = [
  { length: 20, height: 15, width: 8 }
] as const;

const RUMBLED_STANDING_DIMENSION_OPTIONS: readonly KerbDimensions[] = [
  { length: 15, height: 20, width: 8 }
] as const;

const HUNCH_CONFIGS = {
  'full-both': { left: 0.8, right: 0.8, title: 'Full Hunch Both Sides (80%)' },
  'half-both': { left: 0.5, right: 0.5, title: 'Half Hunch Both Sides (50%)' },
  'small-both': { left: 0.2, right: 0.2, title: 'Small Hunch Both Sides (20%)' },
  'full-half': { left: 0.8, right: 0.5, title: 'Full Left, Half Right' },
  'full-small': { left: 0.8, right: 0.2, title: 'Full Left, Small Right' },
  'half-small': { left: 0.5, right: 0.2, title: 'Half Left, Small Right' }
} as const;

const KerbsEdgesAndSetsCalculator: React.FC<CalculatorProps> = ({ 
  onResultsChange,
  onInputsChange,
  type,
  isInProjectCreating = false,
  initialLength,
  savedInputs = {},
  canvasMode = false,
  canvasLength,
  calculateTransport: propCalculateTransport,
  setCalculateTransport: propSetCalculateTransport,
  selectedTransportCarrier: propSelectedTransportCarrier,
  setSelectedTransportCarrier: propSetSelectedTransportCarrier,
  transportDistance: propTransportDistance,
  setTransportDistance: propSetTransportDistance,
  carriers: propCarriers = [],
  selectedExcavator: propSelectedExcavator,
  recalculateTrigger = 0
}) => {
  // State
  const { t } = useTranslation(['calculator', 'utilities', 'common', 'units']);
  const companyId = useAuthStore(state => state.getCompanyId());
  const segmentLengths: number[] = savedInputs?.segmentLengths ?? [];
  const totalLengthCanvas = canvasLength ?? (segmentLengths.length > 0 ? segmentLengths.reduce((a, b) => a + b, 0) : 0);
  const initLength = savedInputs?.length != null ? String(savedInputs.length) : (initialLength != null ? initialLength.toFixed(3) : (totalLengthCanvas > 0 ? totalLengthCanvas.toFixed(3) : ''));
  const [kerbType, setKerbType] = useState<KerbType>(type);
  const [length, setLength] = useState(initLength);
  const [kerbConfigMode, setKerbConfigMode] = useState<'single' | 'segments'>(segmentLengths.length > 1 ? 'segments' : 'single');
  useEffect(() => {
    if (savedInputs?.length != null) setLength(String(savedInputs.length));
    else if (initialLength != null && isInProjectCreating) setLength(initialLength.toFixed(3));
    else if (totalLengthCanvas > 0 && segmentLengths.length <= 1) setLength(totalLengthCanvas.toFixed(3));
  }, [savedInputs?.length, initialLength, isInProjectCreating, totalLengthCanvas, segmentLengths.length]);
  useEffect(() => {
    if (segmentLengths.length > 1) setKerbConfigMode('segments');
  }, [segmentLengths.length]);
  const [baseHeight, setBaseHeight] = useState(savedInputs?.baseHeight ?? '');
  const [hunchType, setHunchType] = useState<HunchType>(savedInputs?.hunchType ?? 'full-both');
  const [isRumbledStanding, setIsRumbledStanding] = useState(savedInputs?.isRumbledStanding ?? false);
  const [selectedFlatDimensionsIndex, setSelectedFlatDimensionsIndex] = useState<number>(savedInputs?.selectedFlatDimensionsIndex ?? 0);
  const [selectedKlDimensionsIndex, setSelectedKlDimensionsIndex] = useState<number>(savedInputs?.selectedKlDimensionsIndex ?? 0);
  const [selectedRumbledDimensionsIndex, setSelectedRumbledDimensionsIndex] = useState<number>(savedInputs?.selectedRumbledDimensionsIndex ?? 0);
  const [selectedSetsDimensionsIndex, setSelectedSetsDimensionsIndex] = useState<number>(savedInputs?.selectedSetsDimensionsIndex ?? 0);
  const [setsLengthwise, setSetsLengthwise] = useState<boolean>(savedInputs?.setsLengthwise ?? true);
  useEffect(() => {
    if (onInputsChange && isInProjectCreating) {
      onInputsChange({ length, baseHeight, hunchType, isRumbledStanding, selectedFlatDimensionsIndex, selectedKlDimensionsIndex, selectedRumbledDimensionsIndex, selectedSetsDimensionsIndex, setsLengthwise });
    }
  }, [length, baseHeight, hunchType, isRumbledStanding, selectedFlatDimensionsIndex, selectedKlDimensionsIndex, selectedRumbledDimensionsIndex, selectedSetsDimensionsIndex, setsLengthwise, onInputsChange, isInProjectCreating]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CalculationResults | null>(null);
  const [segmentResults, setSegmentResults] = useState<Array<{ lengthM: number; units: number; unit: string }>>([]);
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

  // Update kerbType when type prop changes
  useEffect(() => {
    setKerbType(type);
  }, [type]);

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

  // Fetch task templates
  const { data: taskTemplates = [] } = useQuery({
    queryKey: ['kerb_tasks', kerbType],
    queryFn: async () => {
      const taskName = KERB_NAMES[kerbType];

      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .ilike('name', `%${taskName}%`);

      if (error) throw error;
      return data;
    }
  });

  // Fetch task template for preparing for the wall (leveling)
  const { data: preparingForWallTask } = useQuery({
    queryKey: ['preparing_for_wall_task'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('name', 'preparing for the wall (leveling)')
        .single();
      if (error) {
        console.error('Error fetching preparing for the wall task:', error);
        throw error;
      }
      return data;
    }
  });

  // Fetch material usage configuration for Kerbs Calculator
  const { data: materialUsageConfig } = useQuery<MaterialUsageConfig[]>({
    queryKey: ['materialUsageConfig', 'kerbs', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('material_usage_configs')
        .select('calculator_id, material_id')
        .eq('calculator_id', 'kerbs')
        .eq('company_id', companyId);

      if (error) throw error;
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

  const fetchMaterialPrices = async (materials: Material[]) => {
    try {
      const materialNames = materials.map(m => m.name);
      
      const { data, error } = await supabase
        .from('materials')
        .select('name, price')
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

  // Get effective dimensions (from selected option)
  const getEffectiveDims = (): KerbDimensions => {
    if (kerbType === 'rumbled') {
      return isRumbledStanding
        ? RUMBLED_STANDING_DIMENSION_OPTIONS[selectedRumbledDimensionsIndex]
        : RUMBLED_FLAT_DIMENSION_OPTIONS[selectedRumbledDimensionsIndex];
    }
    if (kerbType === 'flat') {
      return FLAT_EDGE_DIMENSION_OPTIONS[selectedFlatDimensionsIndex];
    }
    if (kerbType === 'sets') {
      return SETS_DIMENSION_OPTIONS[selectedSetsDimensionsIndex];
    }
    if (kerbType === 'kl') return KL_DIMENSION_OPTIONS[selectedKlDimensionsIndex];
    return KERB_DIMENSIONS.sets;
  };

  // Calculate mortar volume based on hunch type
  const calculateMortarVolume = (lengthM: number, baseHeightCm: number) => {
    const dims = getEffectiveDims();
    
    const hunchConfig = HUNCH_CONFIGS[hunchType as keyof typeof HUNCH_CONFIGS];
    const lengthCm = lengthM * 100;
    
    // For sets: perpendicular dim depends on orientation (lengthwise vs crosswise)
    const perpendicularCm = (kerbType === 'sets')
      ? (setsLengthwise ? dims.width : dims.length)
      : dims.width;
    
    // Base mortar volume
    let volume = (lengthCm * perpendicularCm * baseHeightCm) / 1000000; // Convert to m³
    
    // Add hunch volumes
    const calculateHunchVolume = (percent: number) => {
      if (percent === 0) return 0;
      const hunchHeight = dims.height * percent;
      const maxWidth = 15; // cm
      // Approximate volume using triangular prism
      return (lengthCm * maxWidth * hunchHeight) / (2 * 1000000); // Convert to m³
    };
    
    volume += calculateHunchVolume(hunchConfig.left);
    volume += calculateHunchVolume(hunchConfig.right);
    
    return volume;
  };

  // Calculate materials needed
  const calculateMaterials = (mortarVolume: number) => {
    // The standard measures (350kg cement and 1600kg sand per m³) already account for the 1:4 ratio
    // No need to apply ratio again as these are industry standard quantities per m³
    
    // 1 m³ of mortar requires approximately 350kg of cement
    const cementKg = mortarVolume * 350;
    // Convert to bags (assume 25kg bags)
    const cementBags = Math.ceil(cementKg / 25);
    
    // 1 m³ of sand weighs approximately 1600kg
    const sandTonnes = mortarVolume * 1.6;
    
    return [
      { name: 'Cement', amount: cementBags, unit: 'bags', price_per_unit: null, total_price: null },
      { name: 'Sand', amount: Number(sandTonnes.toFixed(2)), unit: 'tonnes', price_per_unit: null, total_price: null }
    ];
  };

  const calculate = async () => {
    setError(null);
    setResult(null);

    const baseHeightCm = parseFloat(baseHeight);

    if (isNaN(baseHeightCm)) {
      setError(t('calculator:enter_valid_length_height'));
      return;
    }

    if (baseHeightCm <= 0) {
      setError(t('calculator:values_must_be_positive'));
      return;
    }

    // Segment lengths: from canvas (single or segments) or single length input
    const segLengths: number[] = (canvasMode && kerbConfigMode === 'single' && totalLengthCanvas > 0)
      ? [totalLengthCanvas]
      : (segmentLengths.length > 0 ? segmentLengths : [parseFloat(length) || 0]);

    const lengthM = segLengths.reduce((a, b) => a + b, 0);
    if (lengthM <= 0 || segLengths.some(s => s <= 0)) {
      setError(t('calculator:values_must_be_positive'));
      return;
    }

    try {
      const dims = getEffectiveDims();
      
      const hunchConfig = HUNCH_CONFIGS[hunchType];
      const taskName = KERB_NAMES[kerbType as keyof typeof KERB_NAMES];

      // Calculate number of individual kerb units needed (based on kerb length in cm)
      const calculateKerbUnits = (lengthInMeters: number): { quantity: number; unit: string } => {
        switch (kerbType) {
          case 'kl':
            return { quantity: lengthInMeters * 10, unit: 'kerbs' };
          case 'rumbled':
            if (isRumbledStanding) {
              return { quantity: Math.ceil(lengthInMeters * 6.67), unit: 'kerbs' };
            } else {
              return { quantity: lengthInMeters * 5, unit: 'kerbs' };
            }
          case 'flat':
            return { quantity: Math.ceil((lengthInMeters * 100) / dims.length), unit: 'pieces' };
          case 'sets':
            const linearCm = lengthInMeters * 100;
            const divisor = setsLengthwise ? dims.length : dims.width;
            return { quantity: Math.ceil(linearCm / divisor), unit: 'sets' };
          default:
            return { quantity: lengthInMeters, unit: 'units' };
        }
      };

      // Per-segment results
      const segResults: Array<{ lengthM: number; units: number; unit: string }> = [];
      let totalKerbQuantity = 0;
      let totalMortarVolume = 0;

      for (let i = 0; i < segLengths.length; i++) {
        const segLenM = segLengths[i] ?? 0;
        const ku = calculateKerbUnits(segLenM);
        totalKerbQuantity += ku.quantity;
        totalMortarVolume += calculateMortarVolume(segLenM, baseHeightCm);
        segResults.push({ lengthM: segLenM, units: ku.quantity, unit: ku.unit });
      }

      setSegmentResults(segResults);

      // Calculate mortar volume (sum over segments)
      const mortarVolume = totalMortarVolume;
      
      // Calculate materials
      const mortarMaterials = calculateMaterials(mortarVolume);
      
      const kerbUnits = { quantity: totalKerbQuantity, unit: segResults[0]?.unit ?? 'kerbs' };
      
      // Get transport distance in meters
      const transportDistanceMeters = parseFloat(effectiveTransportDistance) || 30;

      // Calculate material transport times if "Calculate transport time" is checked
      let kerbTransportTime = 0;
      let sandTransportTime = 0;
      let cementTransportTime = 0;
      let normalizedKerbTransportTime = 0;
      let normalizedSandTransportTime = 0;
      let normalizedCementTransportTime = 0;

      if (effectiveCalculateTransport) {
        let carrierSizeForTransport = 0.125;
        
        if (effectiveSelectedTransportCarrier) {
          carrierSizeForTransport = effectiveSelectedTransportCarrier["size (in tones)"] || 0.125;
        }

        // Get material type for kerbs
        let materialType = 'kerbsSmall';
        if (kerbType === 'kl' || kerbType === 'sets') {
          materialType = 'kerbsSmall';
        } else if (kerbType === 'rumbled') {
          materialType = 'kerbsLarge';
        } else if (kerbType === 'flat') {
          materialType = 'kerbsSmall';
        }

        // Calculate kerb transport
        if (kerbUnits.quantity > 0) {
          const kerbResult = calculateMaterialTransportTime(kerbUnits.quantity, carrierSizeForTransport, materialType, transportDistanceMeters);
          kerbTransportTime = kerbResult.totalTransportTime;
          normalizedKerbTransportTime = kerbResult.normalizedTransportTime;
        }

        // Calculate sand transport
        if (mortarMaterials[1] && mortarMaterials[1].amount > 0) {
          const sandResult = calculateMaterialTransportTime(mortarMaterials[1].amount, carrierSizeForTransport, 'sand', transportDistanceMeters);
          sandTransportTime = sandResult.totalTransportTime;
          normalizedSandTransportTime = sandResult.normalizedTransportTime;
        }

        // Calculate cement transport
        if (mortarMaterials[0] && mortarMaterials[0].amount > 0) {
          const cementResult = calculateMaterialTransportTime(mortarMaterials[0].amount, carrierSizeForTransport, 'cement', transportDistanceMeters);
          cementTransportTime = cementResult.totalTransportTime;
          normalizedCementTransportTime = cementResult.normalizedTransportTime;
        }
      }
      
      // Add kerb/edge/set materials
      const materials = [
        { 
          name: KERB_NAMES[kerbType],
          amount: kerbUnits.quantity,
          unit: kerbUnits.unit,
          price_per_unit: null,
          total_price: null
        },
        ...mortarMaterials
      ];

      // Fetch material prices
      const materialsWithPrices = await fetchMaterialPrices(materials);

      // Calculate labor hours
      const relevantTask = taskTemplates[0];
      if (!relevantTask) {
        setError(t('calculator:task_template_not_found'));
        return;
      }

      const laborHours = (relevantTask.estimated_hours || 0) * lengthM;

      // Create task breakdown with proper format
      const taskBreakdown: {name?: string; task?: string; hours: number; quantity?: number; amount?: number | string; unit: string; normalizedHours?: number; event_task_id?: string | null}[] = [{
        name: relevantTask.name || '',
        hours: laborHours,
        quantity: lengthM,
        unit: 'metres',
        event_task_id: relevantTask.id
      }];

      // Add transport tasks if applicable
      if (effectiveCalculateTransport && kerbTransportTime > 0) {
        taskBreakdown.push({
          name: 'transport kerbs',
          hours: kerbTransportTime,
          quantity: kerbUnits.quantity,
          unit: kerbUnits.unit,
          normalizedHours: normalizedKerbTransportTime
        });
      }

      if (effectiveCalculateTransport && sandTransportTime > 0) {
        taskBreakdown.push({
          name: 'transport sand',
          hours: sandTransportTime,
          quantity: mortarMaterials[1]?.amount || 0,
          unit: 'tonnes',
          normalizedHours: normalizedSandTransportTime
        });
      }

      if (effectiveCalculateTransport && cementTransportTime > 0) {
        taskBreakdown.push({
          name: 'transport cement',
          hours: cementTransportTime,
          quantity: mortarMaterials[0]?.amount || 0,
          unit: 'bags',
          normalizedHours: normalizedCementTransportTime
        });
      }

      // Add preparing for the wall (leveling) task if available
      if (preparingForWallTask && preparingForWallTask.estimated_hours !== undefined && preparingForWallTask.estimated_hours !== null) {
        taskBreakdown.push({
          name: 'Preparing for kerbs/edges (leveling)',
          hours: lengthM * preparingForWallTask.estimated_hours,
          quantity: lengthM,
          unit: 'metres',
          event_task_id: preparingForWallTask.id
        });
      }

      // Format results to match ProjectCreating.tsx expectations
      const formattedResults: CalculationResults = {
        name: `${kerbType.toUpperCase()} ${kerbType === 'sets' ? 'Installation' : 'Kerbs Installation'}`,
        amount: lengthM,
        unit: 'metres',
        hours_worked: taskBreakdown.reduce((sum, t) => sum + t.hours, 0),
        materials: materialsWithPrices.map(material => ({
          name: material.name,
          quantity: material.amount,
          unit: material.unit,
          price_per_unit: material.price_per_unit,
          total_price: material.total_price
        })),
        taskBreakdown: taskBreakdown.map(task => ({
          task: task.name,
          hours: task.hours,
          amount: task.quantity,
          unit: task.unit,
          event_task_id: task.event_task_id
        }))
      };

      setResult(formattedResults);

      // Notify parent component of results
      if (onResultsChange) {
        onResultsChange(formattedResults);
      }

      // Store results in data attribute for database
      const calculatorElement = document.querySelector('[data-calculator-results]');
      if (calculatorElement) {
        calculatorElement.setAttribute('data-results', JSON.stringify(formattedResults));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  // Recalculate when project settings (transport, equipment) change
  useEffect(() => {
    if (recalculateTrigger > 0 && isInProjectCreating) {
      void calculate();
    }
  }, [recalculateTrigger]);

  // Get current dimensions
  const currentDims = getEffectiveDims();

  // For flat kerbs or rumbled kerbs laid flat, swap height and width
  const visualDims = (kerbType === 'flat' || (kerbType === 'rumbled' && !isRumbledStanding))
    ? { width: currentDims.height, height: currentDims.width }
    : currentDims;

  // Scroll to results when they appear
  useEffect(() => {
    if (result && resultsRef.current) {
      setTimeout(() => {
        const modalContainer = resultsRef.current?.closest('[data-calculator-results]');
        if (modalContainer) {
          modalContainer.scrollTop = resultsRef.current.offsetTop - 100;
        } else {
          resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [result]);

  const radioOptionStyle = (checked: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
    padding: `${spacing.lg}px 0`,
    cursor: 'pointer' as const,
  });
  const radioInputStyle = {
    width: 16,
    height: 16,
    accentColor: colors.accentBlue,
  };

  return (
    <div style={{ fontFamily: fonts.body, display: 'flex', flexDirection: 'column', gap: spacing["6xl"] }}>
      <h2 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.semibold, color: colors.textPrimary, fontFamily: fonts.display }}>
        {KERB_NAMES[kerbType]} Calculator
      </h2>
      <p style={{ fontSize: fontSizes.sm, color: colors.textDim, fontFamily: fonts.body }}>
        Calculate materials, time, and costs for {KERB_NAMES[kerbType].toLowerCase()} installation projects.
      </p>

      <Card padding={`${spacing["6xl"]}px ${spacing["6xl"]}px ${spacing.md}px`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing["5xl"] }}>
        {kerbType === 'kl' && (
          <div>
            <Label>{t('calculator:flat_edge_dimensions_label')}</Label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md, marginTop: spacing.sm }}>
              {KL_DIMENSION_OPTIONS.map((dims, index) => (
                <label key={index} style={radioOptionStyle(selectedKlDimensionsIndex === index)}>
                  <input
                    type="radio"
                    name="klDimensions"
                    checked={selectedKlDimensionsIndex === index}
                    onChange={() => setSelectedKlDimensionsIndex(index)}
                    style={radioInputStyle}
                  />
                  <span style={{ fontSize: fontSizes.base, color: colors.textMuted, fontFamily: fonts.body }}>
                    {t('calculator:flat_edge_dimensions_format', { l: dims.length, h: dims.height, w: dims.width })}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {kerbType === 'rumbled' && (
          <>
            <div>
              <Label>{t('calculator:installation_method')}</Label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md, marginTop: spacing.sm }}>
                <label style={radioOptionStyle(!isRumbledStanding)}>
                  <input type="radio" checked={!isRumbledStanding} onChange={() => setIsRumbledStanding(false)} style={radioInputStyle} />
                  <span style={{ fontSize: fontSizes.base, color: colors.textMuted, fontFamily: fonts.body }}>{t('calculator:flat_label')}</span>
                </label>
                <label style={radioOptionStyle(isRumbledStanding)}>
                  <input type="radio" checked={isRumbledStanding} onChange={() => setIsRumbledStanding(true)} style={radioInputStyle} />
                  <span style={{ fontSize: fontSizes.base, color: colors.textMuted, fontFamily: fonts.body }}>{t('calculator:standing_label')}</span>
                </label>
              </div>
            </div>
            <div>
              <Label>{t('calculator:flat_edge_dimensions_label')}</Label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md, marginTop: spacing.sm }}>
                {(isRumbledStanding ? RUMBLED_STANDING_DIMENSION_OPTIONS : RUMBLED_FLAT_DIMENSION_OPTIONS).map((dims, index) => (
                  <label key={index} style={radioOptionStyle(selectedRumbledDimensionsIndex === index)}>
                    <input type="radio" name="rumbledDimensions" checked={selectedRumbledDimensionsIndex === index} onChange={() => setSelectedRumbledDimensionsIndex(index)} style={radioInputStyle} />
                    <span style={{ fontSize: fontSizes.base, color: colors.textMuted, fontFamily: fonts.body }}>{t('calculator:flat_edge_dimensions_format', { l: dims.length, h: dims.height, w: dims.width })}</span>
                  </label>
                ))}
              </div>
            </div>
          </>
        )}

        {kerbType === 'flat' && (
          <div>
            <Label>{t('calculator:flat_edge_dimensions_label')}</Label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md, marginTop: spacing.sm }}>
              {FLAT_EDGE_DIMENSION_OPTIONS.map((dims, index) => (
                <label key={index} style={radioOptionStyle(selectedFlatDimensionsIndex === index)}>
                  <input type="radio" name="flatDimensions" checked={selectedFlatDimensionsIndex === index} onChange={() => setSelectedFlatDimensionsIndex(index)} style={radioInputStyle} />
                  <span style={{ fontSize: fontSizes.base, color: colors.textMuted, fontFamily: fonts.body }}>{t('calculator:flat_edge_dimensions_format', { l: dims.length, h: dims.height, w: dims.width })}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {kerbType === 'sets' && (
          <>
            <div>
              <Label>{t('calculator:sets_dimensions_label')}</Label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md, marginTop: spacing.sm }}>
                {SETS_DIMENSION_OPTIONS.map((dims, index) => (
                  <label key={index} style={radioOptionStyle(selectedSetsDimensionsIndex === index)}>
                    <input type="radio" name="setsDimensions" checked={selectedSetsDimensionsIndex === index} onChange={() => setSelectedSetsDimensionsIndex(index)} style={radioInputStyle} />
                    <span style={{ fontSize: fontSizes.base, color: colors.textMuted, fontFamily: fonts.body }}>{t('calculator:sets_dimensions_format', { l: dims.length, h: dims.height, w: dims.width })}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label>{t('calculator:sets_orientation_label')}</Label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md, marginTop: spacing.sm }}>
                <label style={radioOptionStyle(setsLengthwise)}>
                  <input type="radio" name="setsOrientation" checked={setsLengthwise} onChange={() => setSetsLengthwise(true)} style={radioInputStyle} />
                  <span style={{ fontSize: fontSizes.base, color: colors.textMuted, fontFamily: fonts.body }}>{t('calculator:sets_lengthwise')}</span>
                </label>
                <label style={radioOptionStyle(!setsLengthwise)}>
                  <input type="radio" name="setsOrientation" checked={!setsLengthwise} onChange={() => setSetsLengthwise(false)} style={radioInputStyle} />
                  <span style={{ fontSize: fontSizes.base, color: colors.textMuted, fontFamily: fonts.body }}>{t('calculator:sets_crosswise')}</span>
                </label>
              </div>
            </div>
          </>
        )}

        {canvasMode && segmentLengths.length > 0 && (
          <div style={{ marginBottom: spacing.xl }}>
            <div style={{ fontSize: fontSizes.sm, fontWeight: fontWeights.semibold, color: colors.textDim, marginBottom: spacing.sm }}>{t('calculator:kerb_configuration_label')}</div>
            <div style={{ display: 'flex', background: colors.bgCardInner, borderRadius: radii.lg, border: `1px solid ${colors.borderDefault}`, padding: spacing.sm, gap: spacing.sm }}>
              <button
                type="button"
                disabled={segmentLengths.length > 1}
                onClick={() => segmentLengths.length <= 1 && setKerbConfigMode('single')}
                title={segmentLengths.length > 1 ? 'Remove segments to use single length' : undefined}
                style={{
                  flex: 1, padding: `${spacing.lg}px ${spacing.xl}px`, borderRadius: radii.lg, border: 'none',
                  background: kerbConfigMode === 'single' ? colors.accentBlueBg : 'transparent',
                  color: segmentLengths.length > 1 ? colors.textFaint : (kerbConfigMode === 'single' ? colors.green : colors.textDim),
                  fontWeight: fontWeights.semibold, fontSize: fontSizes.base, cursor: segmentLengths.length > 1 ? 'not-allowed' : 'pointer', opacity: segmentLengths.length > 1 ? 0.5 : 1
                }}
              >
                Single length
              </button>
              <button
                type="button"
                onClick={() => setKerbConfigMode('segments')}
                style={{
                  flex: 1, padding: `${spacing.lg}px ${spacing.xl}px`, borderRadius: radii.lg, border: 'none',
                  background: kerbConfigMode === 'segments' ? colors.accentBlueBg : 'transparent',
                  color: kerbConfigMode === 'segments' ? colors.green : colors.textDim, fontWeight: fontWeights.semibold, fontSize: fontSizes.base, cursor: 'pointer'
                }}
              >
                Segments ({segmentLengths.length})
              </button>
            </div>
            <div style={{ fontSize: fontSizes.xs, color: colors.textDim, marginTop: spacing.sm }}>
              Total length: <strong style={{ color: colors.textSecondary }}>{totalLengthCanvas.toFixed(3)} m</strong>
            </div>
          </div>
        )}

        <TextInput
          label={kerbType === 'sets' ? (setsLengthwise ? t('calculator:input_total_length_m') : t('calculator:input_total_width_m')) : t('calculator:kerb_total_length_m')}
          value={length}
          onChange={setLength}
          placeholder={t('calculator:placeholder_enter_length_m')}
          unit="m"
        />

        <TextInput
          label={t('calculator:kerb_mortar_height_cm')}
          value={baseHeight}
          onChange={setBaseHeight}
          placeholder={t('calculator:placeholder_mortar_depth_cm')}
          unit="cm"
        />

        <div>
          <Label>{t('calculator:hunch_configuration')}</Label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing["5xl"], marginTop: spacing.sm }}>
            {Object.entries(HUNCH_CONFIGS).map(([key, config]) => (
              <button
                key={key}
                onClick={() => setHunchType(key as HunchType)}
                style={{
                  padding: spacing.md,
                  borderRadius: radii.lg,
                  border: hunchType === key ? `3px solid ${colors.accentBlue}` : `1px solid ${colors.borderInput}`,
                  background: hunchType === key ? colors.accentBlueBg : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <KerbVisualization
                  kerbWidth={visualDims.width}
                  kerbHeight={visualDims.height}
                  baseHeight={parseFloat(baseHeight) || 3}
                  leftHunchPercent={config.left}
                  rightHunchPercent={config.right}
                  title={t(`calculator:hunch_${key.replace(/-/g, '_')}`)}
                  isFlat={kerbType === 'rumbled' && !isRumbledStanding}
                />
              </button>
            ))}
          </div>
        </div>

        {!isInProjectCreating && (
          <Checkbox label={t('calculator:calculate_transport_time_label')} checked={calculateTransport} onChange={setCalculateTransport} />
        )}

        {!isInProjectCreating && effectiveCalculateTransport && (
          <>
            <div>
              <Label>{t('calculator:transport_carrier')}</Label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md, marginTop: spacing.sm }}>
                <div
                  style={{
                    display: 'flex', alignItems: 'center', padding: spacing.md, cursor: 'pointer', borderRadius: radii.lg,
                    border: `2px dashed ${colors.borderInput}`, background: effectiveSelectedTransportCarrier === null ? colors.bgHover : 'transparent',
                  }}
                  onClick={() => setSelectedTransportCarrier(null)}
                >
                  <div style={{ width: 16, height: 16, borderRadius: radii.full, border: `2px solid ${colors.borderMedium}`, marginRight: spacing.md, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {effectiveSelectedTransportCarrier === null && <div style={{ width: 8, height: 8, borderRadius: radii.full, background: colors.textSubtle }} />}
                  </div>
                  <span style={{ fontSize: fontSizes.base, color: colors.textSecondary }}>{t('calculator:default_wheelbarrow')}</span>
                </div>
                {carriers.length > 0 && carriers.map((carrier) => (
                  <div key={carrier.id} style={{ display: 'flex', alignItems: 'center', padding: spacing.md, cursor: 'pointer', borderRadius: radii.lg, background: effectiveSelectedTransportCarrier?.id === carrier.id ? colors.bgHover : 'transparent' }} onClick={() => setSelectedTransportCarrier(carrier)}>
                    <div style={{ width: 16, height: 16, borderRadius: radii.full, border: `2px solid ${colors.borderMedium}`, marginRight: spacing.md, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {effectiveSelectedTransportCarrier?.id === carrier.id && <div style={{ width: 8, height: 8, borderRadius: radii.full, background: colors.textSubtle }} />}
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
              value={transportDistance}
              onChange={setTransportDistance}
              placeholder={t('calculator:placeholder_enter_transport_distance')}
              helperText={t('calculator:set_to_zero_no_transport')}
            />
          </>
        )}

        <Button onClick={calculate} variant="primary" fullWidth>
          {t('calculator:calculate_button')}
        </Button>

        {error && (
          <div style={{ padding: spacing.base, background: 'rgba(239,68,68,0.15)', border: `1px solid ${colors.red}`, borderRadius: radii.lg, color: colors.textPrimary }}>
            {error}
          </div>
        )}

        {result && (
          <div style={{ marginTop: spacing["6xl"], display: 'flex', flexDirection: 'column', gap: spacing["5xl"] }} ref={resultsRef}>
            {segmentResults.length > 1 && (
              <div style={{ marginBottom: spacing["3xl"] }}>
                <div style={{ fontSize: fontSizes.sm, fontWeight: fontWeights.bold, color: colors.textSubtle, marginBottom: spacing.md }}>{t('calculator:kerb_segments_label')}</div>
                <div style={{ background: colors.bgCardInner, border: `1px solid ${colors.borderDefault}`, borderRadius: radii["2xl"], overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 100px', padding: `${spacing.md}px ${spacing.xl}px`, borderBottom: `1px solid ${colors.borderLight}`, fontSize: fontSizes.xs, fontWeight: fontWeights.bold, color: colors.textDim, textTransform: 'uppercase' }}>
                    <span>#</span>
                    <span>{t('calculator:segment_length_m')}</span>
                    <span style={{ textAlign: 'right' }}>{t('calculator:units_label')}</span>
                  </div>
                  {segmentResults.map((seg, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 100px', alignItems: 'center', padding: `${spacing.lg}px ${spacing.xl}px`, borderBottom: idx < segmentResults.length - 1 ? `1px solid ${colors.borderLight}` : 'none', background: idx % 2 === 1 ? colors.bgTableRowAlt : undefined, fontSize: fontSizes.base }}>
                      <span style={{ fontWeight: fontWeights.semibold, color: colors.textDim }}>{idx + 1}</span>
                      <span style={{ fontWeight: fontWeights.semibold, color: colors.textSecondary }}>{seg.lengthM.toFixed(2)} m</span>
                      <span style={{ textAlign: 'right', color: colors.textSecondary }}>{seg.units} {translateUnit(seg.unit, t)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <Card style={{ background: gradients.blueCard, border: `1px solid ${colors.accentBlueBorder}` }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: spacing.lg }}>
                <span style={{ fontSize: fontSizes.md, color: colors.textSubtle, fontFamily: fonts.display, fontWeight: fontWeights.semibold }}>
                  {t('calculator:total_labor_hours_label')}
                </span>
                <span style={{ fontSize: fontSizes["4xl"], fontWeight: fontWeights.extrabold, color: colors.accentBlue, fontFamily: fonts.display }}>
                  {result.hours_worked.toFixed(2)}
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
                {result.taskBreakdown.map((task, index) => (
                  <div key={index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${spacing.lg}px ${spacing["2xl"]}px`, background: colors.bgSubtle, borderRadius: radii.lg, border: `1px solid ${colors.borderLight}` }}>
                    <span style={{ fontSize: fontSizes.base, color: colors.textMuted, fontFamily: fonts.body }}>{translateTaskName(task.task || task.name || '', t)}</span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: spacing.xs }}>
                      <span style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.bold, color: colors.textSecondary, fontFamily: fonts.display }}>{task.hours.toFixed(2)}</span>
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
              rows={result.materials.map((m) => ({
                name: <span style={{ fontSize: fontSizes.base, color: colors.textMuted, fontFamily: fonts.body }}>{m.name}</span>,
                quantity: <span style={{ fontSize: fontSizes.base, color: colors.textSubtle }}>{m.quantity.toFixed(2)}</span>,
                unit: <span style={{ fontSize: fontSizes.sm, color: colors.textDim }}>{translateUnit(m.unit, t)}</span>,
                price: <span style={{ fontSize: fontSizes.base, color: colors.textSubtle }}>{m.price_per_unit ? `£${m.price_per_unit.toFixed(2)}` : 'N/A'}</span>,
                total: <span style={{ fontSize: fontSizes.md, fontWeight: fontWeights.bold, color: colors.textSecondary }}>{m.total_price ? `£${m.total_price.toFixed(2)}` : 'N/A'}</span>,
              }))}
              footer={
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: spacing.md }}>
                  <span style={{ fontSize: fontSizes.base, color: colors.textSubtle, fontFamily: fonts.display, fontWeight: fontWeights.semibold }}>Total Cost:</span>
                  <span style={{ fontSize: fontSizes["2xl"], fontWeight: fontWeights.extrabold, color: colors.textPrimary, fontFamily: fonts.display }}>
                    {result.materials.some(m => m.total_price !== null) ? `£${result.materials.reduce((sum, m) => sum + (m.total_price || 0), 0).toFixed(2)}` : 'N/A'}
                  </span>
                </div>
              }
            />
          </div>
        )}
        </div>
      </Card>
    </div>
  );
};

export default KerbsEdgesAndSetsCalculator;
