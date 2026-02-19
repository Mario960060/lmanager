import React, { useState, ChangeEvent, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { carrierSpeeds, getMaterialCapacity } from '../../constants/materialCapacity';
import { translateTaskName } from '../../lib/translationMap';

interface SleeperWallCalculatorProps {
  onResultsChange?: (results: CalculationResult) => void;
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

interface MaterialPrice {
  name: string;
  price: number;
}

interface TaskTemplate {
  id: string;
  name: string;
  unit: string;
  estimated_hours: number;
}

interface TaskBreakdown {
  task: string;
  hours: number;
  amount: number;
  unit: string;
}

interface CalculationResult {
  name: string;
  amount: number;
  unit: string;
  hours_worked: number;
  materials: {
    name: string;
    quantity: number;
    unit: string;
  }[];
  taskBreakdown: {
    task: string;
    hours: number;
    amount: number;
    unit: string;
  }[];
}

interface DiggingEquipment {
  id: string;
  name: string;
  'size (in tones)': number;
}

interface InternalCalculationResult {
  name: string;
  materials: Material[];
  taskBreakdown: TaskBreakdown[];
  labor: number;
  roundedUpHeight: number;
  originalHeight: number;
  postHeightMeters?: number;
  piecesPerPost?: number;
  totalPosts?: number;
  materialPostsNeeded?: number;
}

interface MaterialUsageConfig {
  calculator_id: string;
  material_id: string;
}

const SLEEPER_DIMENSIONS = {
  length: 2400, // mm
  height: 200,  // mm
  width: 100    // mm
};

const SleeperWallCalculator: React.FC<SleeperWallCalculatorProps> = ({ 
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
  // Input states
  const { t } = useTranslation(['calculator', 'utilities', 'common']);
  const companyId = useAuthStore(state => state.getCompanyId());
  const [length, setLength] = useState('');
  const [height, setHeight] = useState('');
  const [postMethod, setPostMethod] = useState<'concrete' | 'direct'>('concrete');
  
  // Result states
  const [result, setResult] = useState<InternalCalculationResult | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [totalHours, setTotalHours] = useState<number | null>(null);
  const [taskBreakdown, setTaskBreakdown] = useState<TaskBreakdown[]>([]);
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

  // Fetch task templates for sleeper wall building
  const { data: taskTemplates = [] } = useQuery<TaskTemplate[]>({
    queryKey: ['sleeper_wall_tasks', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId)
        .or('name.ilike.%sleeper wall%,name.ilike.%digging holes%,name.ilike.%setting up posts%');

      if (error) throw error;
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

  // Fetch material usage configuration for Sleeper Wall Calculator
  const { data: materialUsageConfig } = useQuery<MaterialUsageConfig[]>({
    queryKey: ['materialUsageConfig', 'sleeper_wall', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('material_usage_configs')
        .select('calculator_id, material_id')
        .eq('calculator_id', 'sleeper_wall')
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
    queryKey: ['materials', materialIds, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .eq('company_id', companyId)
        .in('id', materialIds);

      if (error) throw error;
      return data;
    },
    enabled: materialIds.length > 0 && !!companyId
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

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>, setter: (value: string) => void) => {
    setter(e.target.value);
  };

  const calculate = async () => {
    const wallLength = parseFloat(length);
    const wallHeight = parseFloat(height);

    if (isNaN(wallLength) || isNaN(wallHeight)) {
      return;
    }

    // Convert measurements to millimeters
    const wallLengthMm = wallLength * 1000;
    const wallHeightMm = wallHeight * 1000;

    // Calculate sleepers needed
    const sleepersPerRow = Math.ceil(wallLengthMm / SLEEPER_DIMENSIONS.length);
    const numberOfRows = Math.ceil(wallHeightMm / SLEEPER_DIMENSIONS.height);
    const totalSleepers = sleepersPerRow * numberOfRows;

    // Calculate posts needed (1 at start + 2 for each sleeper in first row)
    const totalPosts = 1 + (sleepersPerRow * 2);

    // Calculate post height needed (wall height + 40cm for foundation)
    const postHeightNeeded = wallHeightMm + 400; // 40cm = 400mm
    const postHeightMeters = postHeightNeeded / 1000;

    // Calculate how many posts can be cut from one 2.4m post
    const standardPostLength = 2400; // 2.4m in mm
    const piecesPerPost = Math.floor(standardPostLength / postHeightNeeded);
    
    // Calculate actual number of 2.4m posts needed as material
    const materialPostsNeeded = Math.ceil(totalPosts / Math.max(1, piecesPerPost));

    // Calculate actual height after rounding up rows
    const roundedUpHeight = numberOfRows * SLEEPER_DIMENSIONS.height;

    // Initialize task breakdown array
    let taskBreakdown: TaskBreakdown[] = [];

    // Find relevant task templates
    const firstLayerTask = taskTemplates.find(t => 
      t.name.toLowerCase().includes('sleeper wall') && 
      t.name.toLowerCase().includes('1st layer')
    );
    const regularLayerTask = taskTemplates.find(t => {
      const name = t.name.toLowerCase();
      // Look for "building a sleeper wall (on top of 1st layer)" or similar
      // Match by looking for "(on top" in the name
      return name.includes('sleeper wall') && name.includes('on top');
    });
    const diggingTask = taskTemplates.find(t => 
      t.name.toLowerCase().includes('digging holes')
    );
    const settingPostsTask = taskTemplates.find(t => 
      t.name.toLowerCase().includes('setting up posts')
    );

    // Calculate hours for first layer
    if (firstLayerTask) {
      taskBreakdown.push({
        task: firstLayerTask.name,
        hours: firstLayerTask.estimated_hours * sleepersPerRow,
        amount: sleepersPerRow,
        unit: 'sleepers'
      });
    }

    // Calculate hours for additional layers
    if (regularLayerTask && numberOfRows > 1) {
      const additionalRows = numberOfRows - 1;
      const additionalSleepers = sleepersPerRow * additionalRows;
      taskBreakdown.push({
        task: regularLayerTask.name,
        hours: regularLayerTask.estimated_hours * additionalSleepers,
        amount: additionalSleepers,
        unit: 'sleepers'
      });
    } else if (numberOfRows > 1) {
      console.warn('No task template found for building sleeper wall on top of 1st layer');
    }

    // Add post-related tasks based on selected method
    if (postMethod === 'concrete') {
      if (diggingTask) {
        taskBreakdown.push({
          task: diggingTask.name,
          hours: diggingTask.estimated_hours * totalPosts,
          amount: totalPosts,
          unit: 'holes'
        });
      }
    }

    if (settingPostsTask) {
      taskBreakdown.push({
        task: settingPostsTask.name,
        hours: settingPostsTask.estimated_hours * totalPosts,
        amount: totalPosts,
        unit: 'posts'
      });
    }

    // Calculate total hours
    const totalHours = taskBreakdown.reduce((sum, task) => sum + task.hours, 0);

    // Note: Sleepers are transported on foot individually
    // Posts: each carried individually (on foot)
    // Postmix: bags (like cement) - calculated via carrier
    let sleeperTransportTime = 0;
    let postTransportTime = 0;
    let postmixTransportTime = 0;

    if (calculateTransport) {
      let carrierSizeForTransport = 0.125;
      
      if (selectedTransportCarrier) {
        carrierSizeForTransport = selectedTransportCarrier["size (in tones)"] || 0.125;
      }

      // Calculate sleepers transport - on foot, 1 per trip
      if (totalSleepers > 0) {
        const sleepersPerTrip = 1; // 1 sleeper per person per trip
        const trips = Math.ceil(totalSleepers / sleepersPerTrip);
        const sleeperCarrySpeed = 1500; // m/h for foot carrying
        const timePerTrip = (parseFloat(transportDistance) || 30) * 2 / sleeperCarrySpeed;
        sleeperTransportTime = trips * timePerTrip;
        
        if (sleeperTransportTime > 0) {
          taskBreakdown.push({
            task: 'transport sleepers',
            hours: sleeperTransportTime,
            amount: totalSleepers,
            unit: 'sleepers'
          });
        }
      }

      // Calculate posts transport - on foot, 1 per trip
      if (totalPosts > 0) {
        const postsPerTrip = 1; // 1 post per person per trip
        const trips = Math.ceil(totalPosts / postsPerTrip);
        const postCarrySpeed = 1500; // m/h for foot carrying
        const timePerTrip = (parseFloat(transportDistance) || 30) * 2 / postCarrySpeed;
        postTransportTime = trips * timePerTrip;
        
        if (postTransportTime > 0) {
          taskBreakdown.push({
            task: 'transport posts',
            hours: postTransportTime,
            amount: totalPosts,
            unit: 'posts'
          });
        }
      }

      // Calculate postmix transport - bags via carrier
      const postmixBags = totalPosts * 2;
      if (postmixBags > 0) {
        const postmixResult = calculateMaterialTransportTime(postmixBags, carrierSizeForTransport, 'cement', parseFloat(transportDistance) || 30);
        postmixTransportTime = postmixResult.totalTransportTime;
        
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

    // Add preparing for the wall (leveling) task if available
    if (preparingForWallTask && preparingForWallTask.estimated_hours !== undefined) {
      const lengthNum = parseFloat(length) || 0;
      taskBreakdown.push({
        task: 'preparing for the wall (leveling)',
        hours: lengthNum * preparingForWallTask.estimated_hours,
        amount: lengthNum,
        unit: 'running meters'
      });
    }

    // Recalculate total hours with transport
    const finalTotalHours = taskBreakdown.reduce((sum, task) => sum + task.hours, 0);

    // Prepare materials list with optimized post calculation
    const materials: Material[] = [
      { name: 'Sleeper', amount: totalSleepers, unit: 'sleepers', price_per_unit: null, total_price: null },
      { name: 'Post', amount: materialPostsNeeded, unit: 'posts (2.4m)', price_per_unit: null, total_price: null },
      { name: 'Postmix', amount: totalPosts * 2, unit: 'bags', price_per_unit: null, total_price: null }
    ];

    // Fetch material prices
    const materialsWithPrices = await fetchMaterialPrices(materials);

    const results: InternalCalculationResult = {
      name: 'Sleeper Wall',
      materials: materialsWithPrices,
      taskBreakdown,
      labor: finalTotalHours,
      roundedUpHeight: roundedUpHeight,
      originalHeight: wallHeightMm,
      postHeightMeters: postHeightMeters,
      piecesPerPost: piecesPerPost,
      totalPosts: totalPosts,
      materialPostsNeeded: materialPostsNeeded
    };

    setResult(results);
    setMaterials(materialsWithPrices);
    setTotalHours(finalTotalHours);
    setTaskBreakdown(taskBreakdown);

    // Notify parent component of results
    if (onResultsChange) {
      const formattedResults: CalculationResult = {
        name: 'Sleeper Wall',
        amount: parseFloat(length) || 0,
        unit: 'metres',
        hours_worked: totalHours,
        materials: materialsWithPrices.map(m => ({
          name: m.name,
          quantity: m.amount,
          unit: m.unit
        })),
        taskBreakdown: taskBreakdown.map(t => ({
          task: t.task,
          hours: t.hours,
          amount: t.amount,
          unit: t.unit
        }))
      };
      onResultsChange(formattedResults);
    }
  };

  // Add useEffect to notify parent of result changes
  useEffect(() => {
    if (totalHours !== null && materials.length > 0) {
      const formattedResults = {
        name: 'Sleeper Wall',
        amount: parseFloat(length) || 0,
        unit: 'metres',
        hours_worked: totalHours,
        materials: materials.map(material => ({
          name: material.name,
          quantity: material.amount,
          unit: material.unit,
          price_per_unit: material.price_per_unit,
          total_price: material.total_price
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
  }, [totalHours, materials, taskBreakdown, length, onResultsChange]);

  useEffect(() => {
    if (result !== null && resultsRef.current) {
      setTimeout(() => {
        const modalContainer = resultsRef.current?.closest('[data-calculator-results]');
        if (modalContainer && resultsRef.current) {
          modalContainer.scrollTop = resultsRef.current.offsetTop - 100;
        } else if (resultsRef.current) {
          resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [result]);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">{t('calculator:sleeper_wall_calculator_title_alt')}</h2>
      <p className="text-sm text-gray-600">
        Calculate materials, time, and costs for sleeper wall installation projects.
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">{t('calculator:input_wall_length_m')}</label>
          <input
            type="number"
            value={length}
            onChange={(e) => handleInputChange(e, setLength)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 form-input"
            step="0.01"
            placeholder={t('calculator:placeholder_enter_wall_length_metres')}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">{t('calculator:input_wall_height_m')}</label>
          <input
            type="number"
            value={height}
            onChange={(e) => handleInputChange(e, setHeight)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 form-input"
            step="0.01"
            placeholder={t('calculator:placeholder_enter_wall_height_metres')}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">{t('calculator:input_post_installation_method')}</label>
          <div className="mt-2 space-x-4">
            <label className={`inline-flex items-center p-2 rounded text-white ${postMethod === 'concrete' ? 'bg-blue-600' : 'bg-gray-500'}`}>
              <input
                type="radio"
                value="concrete"
                checked={postMethod === 'concrete'}
                onChange={() => setPostMethod('concrete')}
                className="form-radio"
              />
              <span className="ml-2">{t('calculator:input_concrete_in_posts')}</span>
            </label>
            <label className={`inline-flex items-center p-2 rounded text-white ${postMethod === 'direct' ? 'bg-blue-600' : 'bg-gray-500'}`}>
              <input
                type="radio"
                value="direct"
                checked={postMethod === 'direct'}
                onChange={() => setPostMethod('direct')}
                className="form-radio"
              />
              <span className="ml-2">{t('calculator:input_drive_posts_directly')}</span>
            </label>
          </div>
        </div>

        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={calculateTransport}
            onChange={(e) => setCalculateTransport(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">{t('calculator:input_calculate_transport_time')}</span>
        </label>

        {/* Transport Carrier Selection */}
        {calculateTransport && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">{t('calculator:input_transport_carrier_optional')}</label>
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

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('calculator:input_transport_distance_meters')}</label>
              <input
                type="number"
                value={transportDistance}
                onChange={(e) => setTransportDistance(e.target.value)}
                className="w-full p-2 border rounded-md"
                placeholder={t('calculator:placeholder_enter_transport_distance_meters')}
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

        {result && (
          <div ref={resultsRef} className="mt-6 space-y-4">
            {result.roundedUpHeight !== result.originalHeight && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-md text-blue-700">
                <p>
                  Note: The wall height has been rounded up to {result.roundedUpHeight / 1000}m to avoid cutting sleepers along their length.
                  This is {((result.roundedUpHeight - result.originalHeight) / 1000).toFixed(2)}m higher than the input height.
                </p>
              </div>
            )}

            {postMethod === 'concrete' && result.postHeightMeters && (
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-md">
                <p className="font-medium mb-2 text-white">{t('calculator:post_calculation_details')}:</p>
                <ul className="text-sm space-y-1 text-white">
                  <li>• Required post height: {result.postHeightMeters.toFixed(2)}m (wall height + 0.4m foundation)</li>
                  <li>• Posts per 2.4m length: {result.piecesPerPost}</li>
                  <li>• Total posts needed: {result.totalPosts} pieces</li>
                  <li>• 2.4m posts to buy: {result.materialPostsNeeded}</li>
                </ul>
              </div>
            )}

            <div>
              <h3 className="text-lg font-medium">{t('calculator:total_labor_hours_label')} <span className="text-blue-600">{result.labor.toFixed(2)} {t('calculator:hours_abbreviation')}</span></h3>
              
              <div className="mt-4">
                <h4 className="font-medium text-gray-700 mb-2">{t('calculator:task_breakdown_label')}</h4>
                <div className="bg-gray-50 p-4 rounded-md">
                  <ul className="space-y-2">
                    {result.taskBreakdown.map((task, index) => (
                      <li key={index} className="flex justify-between text-sm">
                        <span className="font-medium">{translateTaskName(task.task, t)}</span>
                        <span className="text-blue-600">{task.hours.toFixed(2)} hours</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-medium text-gray-700 mb-2">{t('calculator:materials_required_label')}</h4>
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
                  <tbody className="bg-white divide-y divide-gray-200">
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
                  </tbody>
                </table>
              </div>

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
        )}
      </div>
    </div>
  );
};

export default SleeperWallCalculator;
