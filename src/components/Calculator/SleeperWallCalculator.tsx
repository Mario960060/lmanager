import React, { useState, ChangeEvent, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { carrierSpeeds, getMaterialCapacity, FOOT_CARRY_SPEED_M_PER_H, DEFAULT_CARRIER_SPEED_M_PER_H } from '../../constants/materialCapacity';
import { translateTaskName, translateUnit, translateMaterialName } from '../../lib/translationMap';
import { colors, fonts, fontSizes, fontWeights, spacing, radii, gradients } from '../../themes/designTokens';
import { Button, Card, DataTable } from '../../themes/uiComponents';

interface SleeperWallCalculatorProps {
  onResultsChange?: (results: CalculationResult) => void;
  onInputsChange?: (inputs: Record<string, any>) => void;
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
  onInputsChange,
  isInProjectCreating = false,
  initialLength,
  savedInputs = {},
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
  // Input states
  const { t } = useTranslation(['calculator', 'utilities', 'common', 'units']);
  const companyId = useAuthStore(state => state.getCompanyId());
  const initLength = savedInputs?.length != null ? String(savedInputs.length) : (initialLength != null ? initialLength.toFixed(3) : '');
  const [length, setLength] = useState(initLength);
  const [height, setHeight] = useState(savedInputs?.height ?? '');
  useEffect(() => {
    if (savedInputs?.length != null) setLength(String(savedInputs.length));
    else if (initialLength != null && isInProjectCreating) setLength(initialLength.toFixed(3));
  }, [savedInputs?.length, initialLength, isInProjectCreating]);
  const [postMethod, setPostMethod] = useState<'concrete' | 'direct'>(savedInputs?.postMethod ?? 'concrete');
  useEffect(() => {
    if (onInputsChange && isInProjectCreating) {
      onInputsChange({ length, height, postMethod });
    }
  }, [length, height, postMethod, onInputsChange, isInProjectCreating]);
  
  // Result states
  const [result, setResult] = useState<InternalCalculationResult | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [totalHours, setTotalHours] = useState<number | null>(null);
  const [taskBreakdown, setTaskBreakdown] = useState<TaskBreakdown[]>([]);
  const [transportDistance, setTransportDistance] = useState<string>('30');
  const [calculateTransport, setCalculateTransport] = useState<boolean>(false);
  const [selectedTransportCarrier, setSelectedTransportCarrier] = useState<DiggingEquipment | null>(null);
  const effectiveCalculateTransport = isInProjectCreating ? (propCalculateTransport ?? false) : calculateTransport;
  const effectiveSelectedTransportCarrier = isInProjectCreating ? (propSelectedTransportCarrier ?? null) : selectedTransportCarrier;
  const effectiveTransportDistance = isInProjectCreating && propTransportDistance ? propTransportDistance : transportDistance;
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
    const carrierSpeed = carrierSpeedData?.speed || DEFAULT_CARRIER_SPEED_M_PER_H;
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
        unit: 'pieces'
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
        unit: 'pieces'
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

    if (effectiveCalculateTransport) {
      let carrierSizeForTransport = 0.125;
      
      if (effectiveSelectedTransportCarrier) {
        carrierSizeForTransport = effectiveSelectedTransportCarrier["size (in tones)"] || 0.125;
      }

      // Calculate sleepers transport - on foot, 1 per trip
      if (totalSleepers > 0) {
        const sleepersPerTrip = 1; // 1 sleeper per person per trip
        const trips = Math.ceil(totalSleepers / sleepersPerTrip);
        const timePerTrip = (parseFloat(effectiveTransportDistance) || 30) * 2 / FOOT_CARRY_SPEED_M_PER_H;
        sleeperTransportTime = trips * timePerTrip;
        
        if (sleeperTransportTime > 0) {
          taskBreakdown.push({
            task: 'transport sleepers',
            hours: sleeperTransportTime,
            amount: totalSleepers,
            unit: 'pieces'
          });
        }
      }

      // Calculate posts transport - on foot, 1 per trip
      if (totalPosts > 0) {
        const postsPerTrip = 1; // 1 post per person per trip
        const trips = Math.ceil(totalPosts / postsPerTrip);
        const timePerTrip = (parseFloat(effectiveTransportDistance) || 30) * 2 / FOOT_CARRY_SPEED_M_PER_H;
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
        const postmixResult = calculateMaterialTransportTime(postmixBags, carrierSizeForTransport, 'cement', parseFloat(effectiveTransportDistance) || 30);
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
      { name: 'Sleeper', amount: totalSleepers, unit: 'pieces', price_per_unit: null, total_price: null },
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
      <p style={{ fontSize: fontSizes.sm, color: colors.textDim }}>
        {t('calculator:sleeper_wall_calculator_description')}
      </p>

      <div className="space-y-4">
        <div>
          <label style={{ display: 'block', fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted }}>{t('calculator:input_wall_length_m')}</label>
          <input
            type="number"
            value={length}
            onChange={(e) => handleInputChange(e, setLength)}
            style={{ marginTop: spacing.sm, display: 'block', width: '100%', borderRadius: radii.md, border: `1px solid ${colors.borderDefault}`, background: colors.bgInput, color: colors.textPrimary, padding: '8px 12px', outline: 'none' }}
            step="0.01"
            placeholder={t('calculator:placeholder_enter_wall_length_metres')}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted }}>{t('calculator:input_wall_height_m')}</label>
          <input
            type="number"
            value={height}
            onChange={(e) => handleInputChange(e, setHeight)}
            style={{ marginTop: spacing.sm, display: 'block', width: '100%', borderRadius: radii.md, border: `1px solid ${colors.borderDefault}`, background: colors.bgInput, color: colors.textPrimary, padding: '8px 12px', outline: 'none' }}
            step="0.01"
            placeholder={t('calculator:placeholder_enter_wall_height_metres')}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted }}>{t('calculator:input_post_installation_method')}</label>
          <div className="mt-2 flex flex-wrap gap-3">
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: spacing['2xl'],
                borderRadius: radii.md,
                cursor: 'pointer',
                color: postMethod === 'concrete' ? '#fff' : colors.textPrimary,
                background: postMethod === 'concrete' ? colors.accentBlue : colors.bgInput,
                border: `1px solid ${postMethod === 'concrete' ? colors.accentBlue : colors.borderDefault}`,
              }}
            >
              <input
                type="radio"
                value="concrete"
                checked={postMethod === 'concrete'}
                onChange={() => setPostMethod('concrete')}
                style={{ accentColor: colors.accentBlue }}
              />
              <span className="ml-2">{t('calculator:input_concrete_in_posts')}</span>
            </label>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: spacing['2xl'],
                borderRadius: radii.md,
                cursor: 'pointer',
                color: postMethod === 'direct' ? '#fff' : colors.textPrimary,
                background: postMethod === 'direct' ? colors.accentBlue : colors.bgInput,
                border: `1px solid ${postMethod === 'direct' ? colors.accentBlue : colors.borderDefault}`,
              }}
            >
              <input
                type="radio"
                value="direct"
                checked={postMethod === 'direct'}
                onChange={() => setPostMethod('direct')}
                style={{ accentColor: colors.accentBlue }}
              />
              <span className="ml-2">{t('calculator:input_drive_posts_directly')}</span>
            </label>
          </div>
        </div>

        {!isInProjectCreating && (
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={calculateTransport}
              onChange={(e) => setCalculateTransport(e.target.checked)}
              style={{ accentColor: colors.accentBlue }}
            />
            <span style={{ fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted }}>{t('calculator:input_calculate_transport_time')}</span>
          </label>
        )}

        {/* Transport Carrier Selection */}
        {!isInProjectCreating && calculateTransport && (
          <div>
            <label style={{ display: 'block', fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted, marginBottom: spacing.lg }}>{t('calculator:input_transport_carrier_optional')}</label>
            <div className="space-y-2">
              <div 
                style={{ display: 'flex', alignItems: 'center', padding: spacing['2xl'], cursor: 'pointer', border: `2px dashed ${colors.borderDefault}`, borderRadius: radii.md }}
                onClick={() => setSelectedTransportCarrier(null)}
              >
                <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${colors.textSubtle}`, marginRight: spacing['2xl'] }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', margin: 2, background: selectedTransportCarrier === null ? colors.textSubtle : 'transparent' }}></div>
                </div>
                <div>
                  <span style={{ color: colors.textPrimary }}>{t('calculator:default_wheelbarrow')}</span>
                </div>
              </div>
              {carriers.length > 0 && carriers.map((carrier) => (
                <div 
                  key={carrier.id}
                  className="flex items-center p-2 cursor-pointer"
                  onClick={() => setSelectedTransportCarrier(carrier)}
                >
                  <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${colors.textSubtle}`, marginRight: spacing['2xl'] }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', margin: 2, background: selectedTransportCarrier?.id === carrier.id ? colors.textSubtle : 'transparent' }}></div>
                  </div>
                  <div>
                    <span style={{ color: colors.textPrimary }}>{carrier.name}</span>
                    <span style={{ fontSize: fontSizes.sm, color: colors.textDim, marginLeft: spacing['2xl'] }}>({carrier["size (in tones)"]} tons)</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mb-4">
              <label style={{ display: 'block', fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted, marginBottom: spacing['2xl'] }}>{t('calculator:input_transport_distance_meters')}</label>
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

        <Button variant="primary" fullWidth onClick={calculate}>
          {t('calculator:calculate_button')}
        </Button>

        {result && (
          <div style={{ marginTop: spacing["6xl"], display: 'flex', flexDirection: 'column', gap: spacing["5xl"] }} ref={resultsRef}>
            {result.roundedUpHeight !== result.originalHeight && (
              <div style={{ padding: spacing['4xl'], background: colors.bgCard, border: `1px solid ${colors.borderDefault}`, borderRadius: radii.md, color: colors.accentBlue }}>
                <p style={{ fontSize: fontSizes.sm, fontFamily: fonts.body }}>
                  {t('calculator:sleeper_rounded_up_note', { height: (result.roundedUpHeight / 1000).toFixed(2), diff: ((result.roundedUpHeight - result.originalHeight) / 1000).toFixed(2) })}
                </p>
              </div>
            )}

            {postMethod === 'concrete' && result.postHeightMeters && (
              <div style={{ padding: spacing['4xl'], background: colors.bgCard, border: `1px solid ${colors.borderDefault}`, borderRadius: radii.md }}>
                <p style={{ fontWeight: fontWeights.medium, marginBottom: spacing.lg, color: colors.textPrimary, fontFamily: fonts.body }}>{t('calculator:post_calculation_details')}:</p>
                <ul style={{ fontSize: fontSizes.sm, color: colors.textPrimary, fontFamily: fonts.body, paddingLeft: spacing["2xl"], margin: 0 }}>
                  <li>• {t('calculator:sleeper_required_post_height', { height: result.postHeightMeters.toFixed(2) })}</li>
                  <li>• {t('calculator:sleeper_posts_per_length', { count: result.piecesPerPost })}</li>
                  <li>• {t('calculator:sleeper_total_posts_needed', { count: result.totalPosts })}</li>
                  <li>• {t('calculator:sleeper_posts_to_buy', { count: result.materialPostsNeeded })}</li>
                </ul>
              </div>
            )}

            <Card style={{ background: gradients.blueCard, border: `1px solid ${colors.accentBlueBorder}` }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: spacing.lg }}>
                <span style={{ fontSize: fontSizes.md, color: colors.textSubtle, fontFamily: fonts.display, fontWeight: fontWeights.semibold }}>
                  {t('calculator:total_labor_hours_label')}
                </span>
                <span style={{ fontSize: fontSizes["4xl"], fontWeight: fontWeights.extrabold, color: colors.accentBlue, fontFamily: fonts.display }}>
                  {result.labor.toFixed(2)}
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
                {result.taskBreakdown.map((task, index) => (
                  <div
                    key={index}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: `${spacing.lg}px ${spacing["2xl"]}px`,
                      background: index % 2 === 1 ? colors.bgTableRowAlt : undefined,
                      borderBottom: index < result.taskBreakdown.length - 1 ? `1px solid ${colors.borderLight}` : 'none',
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

            <DataTable
              columns={[
                { key: 'name', label: t('calculator:table_material_header'), width: '2fr' },
                { key: 'quantity', label: t('calculator:table_quantity_header'), width: '1fr' },
                { key: 'unit', label: t('calculator:table_unit_header'), width: '1fr' },
                { key: 'price', label: t('calculator:table_price_per_unit_header'), width: '1fr' },
                { key: 'total', label: t('calculator:table_total_header'), width: '1fr' },
              ]}
              rows={result.materials.map((m) => ({
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
                    {result.materials.some(m => m.total_price !== null) ? `£${result.materials.reduce((sum, m) => sum + (m.total_price || 0), 0).toFixed(2)}` : t('calculator:not_available')}
                  </span>
                </div>
              }
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default SleeperWallCalculator;
