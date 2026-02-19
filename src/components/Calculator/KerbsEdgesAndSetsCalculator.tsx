import React, { useState, useEffect, useRef, ChangeEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import KerbVisualization from './KerbVisualization';
import { carrierSpeeds, getMaterialCapacity } from '../../constants/materialCapacity';
import { translateTaskName } from '../../lib/translationMap';

interface CalculatorProps {
  onResultsChange?: (results: CalculationResults) => void;
  type: KerbType;
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
  sets: '10x10 sets'
} as const;

const KERB_DIMENSIONS = {
  kl: { length: 10, height: 20, width: 10 } as const,
  rumbled: {
    flat: { length: 20, height: 15, width: 8 } as const,
    standing: { length: 15, height: 20, width: 8 } as const
  } as const,
  flat: { length: 100, height: 15, width: 5 } as const,
  sets: { length: 10, height: 5, width: 10 } as const
} as const;

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
  type,
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
  // State
  const { t } = useTranslation(['calculator', 'utilities', 'common']);
  const companyId = useAuthStore(state => state.getCompanyId());
  const [kerbType, setKerbType] = useState<KerbType>(type);
  const [length, setLength] = useState('');
  const [baseHeight, setBaseHeight] = useState('');
  const [hunchType, setHunchType] = useState<HunchType>('full-both');
  const [isRumbledStanding, setIsRumbledStanding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CalculationResults | null>(null);
  const [transportDistance, setTransportDistance] = useState<string>('30');
  const [calculateTransport, setCalculateTransport] = useState<boolean>(false);
  const [selectedTransportCarrier, setSelectedTransportCarrier] = useState<DiggingEquipment | null>(null);
  const [carriersLocal, setCarriersLocal] = useState<DiggingEquipment[]>([]);
  const resultsRef = useRef<HTMLDivElement>(null);

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
    
    if (calculateTransport) {
      fetchEquipment();
    }
  }, [calculateTransport]);

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

  // Calculate mortar volume based on hunch type
  const calculateMortarVolume = (lengthM: number, baseHeightCm: number) => {
    let dims: KerbDimensions;
    if (kerbType === 'rumbled') {
      dims = isRumbledStanding ? KERB_DIMENSIONS.rumbled.standing : KERB_DIMENSIONS.rumbled.flat;
    } else if (kerbType === 'kl') {
      dims = KERB_DIMENSIONS.kl;
    } else if (kerbType === 'flat') {
      dims = KERB_DIMENSIONS.flat;
    } else {
      dims = KERB_DIMENSIONS.sets;
    }
    
    const hunchConfig = HUNCH_CONFIGS[hunchType as keyof typeof HUNCH_CONFIGS];
    const lengthCm = lengthM * 100;
    
    // Base mortar volume
    let volume = (lengthCm * dims.width * baseHeightCm) / 1000000; // Convert to m³
    
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

    const lengthM = parseFloat(length);
    const baseHeightCm = parseFloat(baseHeight);

    if (isNaN(lengthM) || isNaN(baseHeightCm)) {
      setError(t('calculator:enter_valid_length_height'));
      return;
    }

    if (lengthM <= 0 || baseHeightCm <= 0) {
      setError(t('calculator:values_must_be_positive'));
      return;
    }

    try {
      const dims = kerbType === 'rumbled' && isRumbledStanding 
        ? KERB_DIMENSIONS.rumbled.standing 
        : kerbType === 'rumbled' 
          ? KERB_DIMENSIONS.rumbled.flat
          : KERB_DIMENSIONS[kerbType as keyof typeof KERB_DIMENSIONS];
      
      const hunchConfig = HUNCH_CONFIGS[hunchType];
      const taskName = KERB_NAMES[kerbType as keyof typeof KERB_NAMES];

      // Calculate mortar volume
      const mortarVolume = calculateMortarVolume(lengthM, baseHeightCm);
      
      // Calculate materials
      const mortarMaterials = calculateMaterials(mortarVolume);
      
      // Calculate number of individual kerb units needed
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
            return { quantity: lengthInMeters * 1, unit: 'pieces' };
          case 'sets':
            return { quantity: lengthInMeters * 10, unit: 'sets' };
          default:
            return { quantity: lengthInMeters, unit: 'units' };
        }
      };
      
      const kerbUnits = calculateKerbUnits(lengthM);
      
      // Get transport distance in meters
      const transportDistanceMeters = parseFloat(transportDistance) || 30;

      // Calculate material transport times if "Calculate transport time" is checked
      let kerbTransportTime = 0;
      let sandTransportTime = 0;
      let cementTransportTime = 0;
      let normalizedKerbTransportTime = 0;
      let normalizedSandTransportTime = 0;
      let normalizedCementTransportTime = 0;

      if (calculateTransport) {
        let carrierSizeForTransport = 0.125;
        
        if (selectedTransportCarrier) {
          carrierSizeForTransport = selectedTransportCarrier["size (in tones)"] || 0.125;
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
      if (calculateTransport && kerbTransportTime > 0) {
        taskBreakdown.push({
          name: 'transport kerbs',
          hours: kerbTransportTime,
          quantity: kerbUnits.quantity,
          unit: kerbUnits.unit,
          normalizedHours: normalizedKerbTransportTime
        });
      }

      if (calculateTransport && sandTransportTime > 0) {
        taskBreakdown.push({
          name: 'transport sand',
          hours: sandTransportTime,
          quantity: mortarMaterials[1]?.amount || 0,
          unit: 'tonnes',
          normalizedHours: normalizedSandTransportTime
        });
      }

      if (calculateTransport && cementTransportTime > 0) {
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

  // Get current dimensions
  const currentDims = (() => {
    if (kerbType === 'rumbled') {
      return isRumbledStanding ? KERB_DIMENSIONS.rumbled.standing : KERB_DIMENSIONS.rumbled.flat;
    }
    return KERB_DIMENSIONS[kerbType];
  })();

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

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">{KERB_NAMES[kerbType]} Calculator</h2>
      <p className="text-sm text-gray-600">
        Calculate materials, time, and costs for {KERB_NAMES[kerbType].toLowerCase()} installation projects.
      </p>

      <div className="space-y-4">
        {kerbType === 'rumbled' && (
          <div>
            <label className="block text-sm font-medium text-gray-700">{t('calculator:installation_method')}</label>
            <div className="mt-2 space-x-4">
              <label className={`inline-flex items-center p-2 rounded text-white ${!isRumbledStanding ? 'bg-blue-600' : 'bg-gray-500'}`}>
                <input
                  type="radio"
                  checked={!isRumbledStanding}
                  onChange={() => setIsRumbledStanding(false)}
                  className="form-radio"
                />
                <span className="ml-2">{t('calculator:flat_label')}</span>
              </label>
              <label className={`inline-flex items-center p-2 rounded text-white ${isRumbledStanding ? 'bg-blue-600' : 'bg-gray-500'}`}>
                <input
                  type="radio"
                  checked={isRumbledStanding}
                  onChange={() => setIsRumbledStanding(true)}
                  className="form-radio"
                />
                <span className="ml-2">{t('calculator:standing_label')}</span>
              </label>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700">{t('calculator:input_length_in_cm')}</label>
          <input
            type="number"
            value={length}
            onChange={(e) => setLength(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 form-input"
            step="0.1"
            placeholder={t('calculator:placeholder_enter_length_m')}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">{t('calculator:input_depth_in_cm')}</label>
          <input
            type="number"
            value={baseHeight}
            onChange={(e) => setBaseHeight(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 form-input"
            step="0.1"
            placeholder={t('calculator:placeholder_enter_depth_cm')}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{t('calculator:hunch_configuration')}</label>
          <div className="grid grid-cols-2 gap-4">
            {Object.entries(HUNCH_CONFIGS).map(([key, config]) => (
              <button
                key={key}
                onClick={() => setHunchType(key as HunchType)}
                className={`p-2 rounded-md transition-all ${
                  hunchType === key 
                    ? 'border-8 border-blue-500' 
                    : 'border border-gray-300 hover:border-blue-300'
                }`}
              >
                <KerbVisualization
                  kerbWidth={visualDims.width}
                  kerbHeight={visualDims.height}
                  baseHeight={parseFloat(baseHeight) || 3}
                  leftHunchPercent={config.left}
                  rightHunchPercent={config.right}
                  title={config.title}
                  isFlat={kerbType === 'rumbled' && !isRumbledStanding}
                />
              </button>
            ))}
          </div>
        </div>

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
            <label className="block text-sm font-medium text-gray-700 mb-3">{t('calculator:transport_carrier')}</label>
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
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors disabled:bg-blue-300"
        >
          {t('calculator:calculate_button')}
        </button>

        {error && (
          <div className="p-3 bg-red-50 text-red-700 rounded-md">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-6 space-y-4" ref={resultsRef}>
            <div>
              <h3 className="text-lg font-medium">{t('calculator:total_labor_hours_label')} <span className="text-blue-600">{result.hours_worked.toFixed(2)} {t('calculator:hours_abbreviation')}</span></h3>
              
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
                    {result.materials.map((material, index) => (
                      <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                          {material.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                          {material.quantity.toFixed(2)}
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
                      result.materials.some(m => m.total_price !== null) 
                        ? `£${result.materials.reduce((sum, m) => sum + (m.total_price || 0), 0).toFixed(2)}`
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

export default KerbsEdgesAndSetsCalculator;
