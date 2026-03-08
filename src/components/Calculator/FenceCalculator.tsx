import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { carrierSpeeds, getMaterialCapacity } from '../../constants/materialCapacity';
import { translateTaskName, translateUnit } from '../../lib/translationMap';
import { colors, fontSizes, radii, spacing } from '../../themes/designTokens';
import { Button } from '../../themes/uiComponents';

interface FenceCalculatorProps {
  fenceType: 'vertical' | 'horizontal';
  onResultsChange?: (results: any) => void;
  onInputsChange?: (inputs: Record<string, any>) => void;
  isInProjectCreating?: boolean;
  initialLength?: number;
  savedInputs?: Record<string, any>;
  /** Canvas Object Card mode — compact UI with segment support */
  canvasMode?: boolean;
  canvasLength?: number;
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

interface TaskBreakdown {
  task: string;
  hours: number;
  amount: string;
  unit: string;
}

interface MaterialPrice {
  name: string;
  price: number | null;
}

interface DiggingEquipment {
  id: string;
  name: string;
  'size (in tones)': number;
}

const FenceCalculator: React.FC<FenceCalculatorProps> = ({ 
  fenceType, 
  onResultsChange,
  onInputsChange,
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
  const { t } = useTranslation(['calculator', 'utilities', 'common']);
  const companyId = useAuthStore(state => state.getCompanyId());

  const segmentLengths: number[] = savedInputs?.segmentLengths ?? [];
  const totalLengthCanvas = canvasLength ?? (segmentLengths.length > 0 ? segmentLengths.reduce((a, b) => a + b, 0) : 0);
  const initLength = savedInputs?.length != null ? String(savedInputs.length) : (initialLength != null ? initialLength.toFixed(3) : (totalLengthCanvas > 0 ? totalLengthCanvas.toFixed(3) : ''));
  const [length, setLength] = useState(initLength);
  const [height, setHeight] = useState(savedInputs?.height ?? '');
  const [fenceConfigMode, setFenceConfigMode] = useState<'single' | 'segments'>(segmentLengths.length > 1 ? 'segments' : 'single');
  useEffect(() => {
    if (savedInputs?.length != null) setLength(String(savedInputs.length));
    else if (initialLength != null && isInProjectCreating) setLength(initialLength.toFixed(3));
    else if (totalLengthCanvas > 0 && segmentLengths.length <= 1) setLength(totalLengthCanvas.toFixed(3));
  }, [savedInputs?.length, initialLength, isInProjectCreating, totalLengthCanvas, segmentLengths.length]);
  useEffect(() => {
    if (segmentLengths.length > 1) setFenceConfigMode('segments');
  }, [segmentLengths.length]);
  const [slatWidth, setSlatWidth] = useState(savedInputs?.slatWidth ?? '10');
  const [slatLength, setSlatLength] = useState(savedInputs?.slatLength ?? '180');
  const [postmixPerPost, setPostmixPerPost] = useState<string>(savedInputs?.postmixPerPost ?? '');
  const lastInputsSentRef = useRef<string>('');
  useEffect(() => {
    if (!onInputsChange || !isInProjectCreating) return;
    const inputs: Record<string, any> = { length, height, slatWidth, slatLength, postmixPerPost };
    if (canvasMode && fenceConfigMode === 'single' && totalLengthCanvas > 0) {
      inputs.segmentLengths = [totalLengthCanvas];
    } else if (segmentLengths.length > 0) {
      inputs.segmentLengths = segmentLengths;
    }
    const key = JSON.stringify(inputs);
    if (lastInputsSentRef.current === key) return;
    lastInputsSentRef.current = key;
    onInputsChange(inputs);
  }, [length, height, slatWidth, slatLength, postmixPerPost, segmentLengths, fenceConfigMode, canvasMode, totalLengthCanvas, onInputsChange, isInProjectCreating]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [totalHours, setTotalHours] = useState<number | null>(null);
  const [calculationError, setCalculationError] = useState<string | null>(null);
  const [taskBreakdown, setTaskBreakdown] = useState<TaskBreakdown[]>([]);
  const [segmentResults, setSegmentResults] = useState<Array<{ lengthM: number; rails: number; slats: number; remainderCm: number; posts: number }>>([]);
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

  // Fetch task template for fence installation
  const { data: layingTask, isLoading } = useQuery({
    queryKey: ['fence_laying_task', fenceType, companyId],
    queryFn: async () => {
      const taskName = fenceType === 'vertical' ? 'standard fence vertical' : 'standard fence horizontal';
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId || '')
        .eq('name', taskName)
        .single();
      
      if (error) {
        console.warn(`No fence laying task found for: ${taskName}`, error);
        return null;
      }
      
      return data;
    },
    enabled: !!companyId
  });

  // Fetch task templates for digging holes and setting up posts
  const { data: taskTemplates = [] } = useQuery({
    queryKey: ['fence_post_tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .or('name.ilike.%digging holes%,name.ilike.%setting up posts%');

      if (error) throw error;
      return data || [];
    }
  });

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

  const fetchMaterialPrices = async (materials: Material[]): Promise<Material[]> => {
    try {
      const materialNames = materials.map(m => m.name);
      
      const { data, error } = await supabase
        .from('materials')
        .select('name, price')
        .in('name', materialNames);
      
      if (error) throw error;
      
      const priceMap = data.reduce((acc: Record<string, number | null>, item: MaterialPrice) => {
        acc[item.name] = item.price || null;
        return acc;
      }, {} as Record<string, number | null>);
      
      return materials.map(material => ({
        ...material,
        price_per_unit: priceMap[material.name] || null,
        total_price: priceMap[material.name] && material.amount ? priceMap[material.name]! * material.amount : null
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

  const calculate = async () => {
    if (!length || !height) {
      setCalculationError(t('calculator:fill_all_required_fields'));
      return;
    }

    const l = parseFloat(length) * 100; // Convert meters to cm
    const h = parseFloat(height) * 100; // Convert meters to cm
    const slatW = parseFloat(slatWidth);
    const slatL = parseFloat(slatLength);

    if (isNaN(l) || isNaN(h) || isNaN(slatW) || (fenceType === 'horizontal' && isNaN(slatL))) {
      setCalculationError(t('calculator:valid_numbers_required'));
      return;
    }

    // Segment lengths: from canvas (single or segments) or single length input
    const segLengths: number[] = (canvasMode && fenceConfigMode === 'single' && totalLengthCanvas > 0)
      ? [totalLengthCanvas]
      : (segmentLengths.length > 0 ? segmentLengths : [l / 100]);

    let posts = 0;
    let slatsNeeded = 0;
    let fenceRails = 0;
    const segResults: Array<{ lengthM: number; rails: number; slats: number; remainderCm: number; posts: number }> = [];

    const POST_SPACING_M = 1.8;

    for (let i = 0; i < segLengths.length; i++) {
      const segLenM = segLengths[i] ?? l / 100;
      const segLenCm = segLenM * 100;

      // Posts: 1 at each segment end (shared at vertices). Intermediate posts: every 1.8m
      const intermediatePosts = Math.max(0, Math.ceil(segLenM / POST_SPACING_M) - 1);
      const isLast = i === segLengths.length - 1;
      const segPosts = (isLast ? 2 : 1) + intermediatePosts; // start + (end if last) + intermediates
      posts += segPosts;

      // Rails: 3 rows per run, 360cm (3.6m) per rail
      const segRails = Math.ceil((segLenM * 3) / 3.6);
      fenceRails += segRails;

      let segSlats: number;
      let remainderCm: number;

      if (fenceType === 'vertical') {
        segSlats = Math.ceil(segLenCm / (slatW + 2)) * Math.ceil(h / slatL);
        remainderCm = segLenCm % (slatW + 2);
      } else {
        segSlats = Math.ceil(segLenCm / slatL) * Math.ceil(h / (slatW + 2));
        remainderCm = segLenCm % slatL;
      }

      slatsNeeded += segSlats;
      segResults.push({ lengthM: segLenM, rails: segRails, slats: segSlats, remainderCm, posts: segPosts });
    }

    posts = Math.max(posts, segLengths.length + 1);
    setSegmentResults(segResults);

    const postmix = parseFloat(postmixPerPost) || 0;
    const totalPostmix = posts * postmix;

    // Calculate labor hours - based on slats count (unit: slat, estimated_hours per slat)
    let mainTaskHours = 0;
    if (layingTask?.estimated_hours !== undefined && layingTask?.estimated_hours !== null && slatsNeeded > 0) {
      mainTaskHours = slatsNeeded * layingTask.estimated_hours;
    }

    const layingUnit = layingTask?.unit || 'slat';

    // Create task breakdown
    const breakdown: TaskBreakdown[] = [];
    
    // Add laying task only if we have valid hours
    if (layingTask?.name && mainTaskHours > 0) {
      breakdown.push({
        task: layingTask.name,
        hours: mainTaskHours,
        amount: `${slatsNeeded} ${layingUnit}s`,
        unit: layingUnit
      });
    } else if (mainTaskHours > 0) {
      // Fallback if no specific laying task found
      breakdown.push({
        task: `${fenceType === 'vertical' ? 'Vertical' : 'Horizontal'} Fence Installation`,
        hours: mainTaskHours,
        amount: `${slatsNeeded} ${layingUnit}s`,
        unit: layingUnit
      });
    }

    // Add digging holes for posts task
    const diggingTask = taskTemplates?.find(t => t.name?.toLowerCase().includes('digging holes'));
    if (diggingTask && diggingTask.estimated_hours && diggingTask.name) {
      breakdown.unshift({
        task: diggingTask.name,
        hours: posts * diggingTask.estimated_hours,
        amount: posts ? `${posts} posts` : '0',
        unit: 'posts'
      });
    }

    // Add setting up posts task
    const settingPostsTask = taskTemplates?.find(t => t.name?.toLowerCase().includes('setting up posts'));
    if (settingPostsTask && settingPostsTask.estimated_hours && settingPostsTask.name) {
      breakdown.push({
        task: settingPostsTask.name,
        hours: posts * settingPostsTask.estimated_hours,
        amount: posts ? `${posts} posts` : '0',
        unit: 'posts'
      });
    }

    // Calculate total hours
    const totalHours = breakdown.reduce((sum, item) => sum + item.hours, 0);

    // Note: Fence materials are transported on foot
    // Posts: each one carried individually (like sleepers)
    // Slats: horizontal - 2 per person, vertical - 15 per person
    // Postmix: bags (like cement) - calculated via carrier
    let postTransportTime = 0;
    let slatTransportTime = 0;
    let postmixTransportTime = 0;

    if (effectiveCalculateTransport) {
      let carrierSizeForTransport = 0.125;
      
      if (effectiveSelectedTransportCarrier) {
        carrierSizeForTransport = effectiveSelectedTransportCarrier["size (in tones)"] || 0.125;
      }

      // Calculate posts transport - each post carried individually (on foot)
      // Estimate: 1 post per trip on foot at 1.5 km/h = 1500 m/h
      if (posts > 0) {
        const postsPerTrip = 1; // 1 post per person per trip
        const trips = Math.ceil(posts / postsPerTrip);
        const postCarrySpeed = 1500; // m/h for foot carrying
        const timePerTrip = (parseFloat(effectiveTransportDistance) || 30) * 2 / postCarrySpeed;
        postTransportTime = trips * timePerTrip;
        
        if (postTransportTime > 0) {
          breakdown.push({
            task: 'transport posts',
            hours: postTransportTime,
            amount: posts ? `${posts} posts` : '0',
            unit: 'posts'
          });
        }
      }

      // Calculate slats transport - on foot
      // Horizontal: 2 slats per person per trip
      // Vertical: 15 slats per person per trip
      if (slatsNeeded > 0) {
        const slatsPerTrip = fenceType === 'vertical' ? 15 : 2;
        const trips = Math.ceil(slatsNeeded / slatsPerTrip);
        const slatCarrySpeed = 1500; // m/h for foot carrying
        const timePerTrip = (parseFloat(effectiveTransportDistance) || 30) * 2 / slatCarrySpeed;
        slatTransportTime = trips * timePerTrip;
        
        if (slatTransportTime > 0) {
          breakdown.push({
            task: 'transport slats',
            hours: slatTransportTime,
            amount: slatsNeeded ? `${slatsNeeded} slats` : '0',
            unit: 'slats'
          });
        }
      }

      // Calculate postmix transport (it's bags like cement)
      if (totalPostmix > 0) {
        const postmixResult = calculateMaterialTransportTime(totalPostmix, carrierSizeForTransport, 'cement', parseFloat(effectiveTransportDistance) || 30);
        postmixTransportTime = postmixResult.totalTransportTime;
        if (postmixTransportTime > 0) {
          breakdown.push({
            task: 'transport postmix',
            hours: postmixTransportTime,
            amount: totalPostmix ? `${totalPostmix} bags` : '0',
            unit: 'bags'
          });
        }
      }
    }

    // Recalculate total hours with transport
    const finalTotalHours = breakdown.reduce((sum, item) => sum + item.hours, 0);

    // Prepare materials list
    const materialsList: Material[] = [
      { name: 'Post', amount: posts, unit: 'posts', price_per_unit: null, total_price: null },
      { name: fenceType === 'vertical' ? (h <= 120 ? '1200 Fence Slats' : '1800 Fence Slats') : 'Fence Slats', amount: slatsNeeded, unit: 'slats', price_per_unit: null, total_price: null },
      { name: 'Postmix', amount: totalPostmix, unit: 'bags', price_per_unit: null, total_price: null }
    ];

    if (fenceType === 'vertical') {
      materialsList.push({ name: 'Fence Rails', amount: fenceRails, unit: 'rails', price_per_unit: null, total_price: null });
    }

    // Fetch prices and update state
    const materialsWithPrices = await fetchMaterialPrices(materialsList);
    
    setMaterials(materialsWithPrices);
    setTotalHours(finalTotalHours);
    setTaskBreakdown(breakdown);
    setCalculationError(null);
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
      const layingItem = taskBreakdown.find(t => ['slat', 'baton', 'board'].includes(t.unit));
      const formattedResults = {
        name: `${fenceType === 'vertical' ? 'Vertical' : 'Horizontal'} Fence Installation`,
        amount: layingItem ? parseInt(layingItem.amount, 10) || 0 : 0,
        unit: layingItem?.unit || 'slat',
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
  }, [totalHours, materials, taskBreakdown, length, fenceType, onResultsChange]);

  // Scroll to results when they appear
  useEffect(() => {
    if ((totalHours !== null || materials.length > 0) && resultsRef.current) {
      setTimeout(() => {
        const modalContainer = resultsRef.current?.closest('[data-calculator-results]');
        if (modalContainer && resultsRef.current) {
          modalContainer.scrollTop = resultsRef.current.offsetTop - 100;
        } else {
          resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [totalHours, materials]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{fenceType === 'vertical' ? 'Vertical' : 'Horizontal'} Fence Calculator</h2>
      <p className="text-sm text-gray-600">
        Calculate materials, time, and costs for {fenceType} fence installation projects.
      </p>

      {canvasMode && segmentLengths.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: colors.textWarm, marginBottom: 6 }}>{t('calculator:fence_configuration_label')}</div>
          <div style={{ display: 'flex', background: colors.bgDeep, borderRadius: radii.md, border: `1px solid ${colors.bgDeepBorder}`, padding: 3, gap: 3 }}>
            <button
              type="button"
              disabled={segmentLengths.length > 1}
              onClick={() => segmentLengths.length <= 1 && setFenceConfigMode('single')}
              title={segmentLengths.length > 1 ? 'Remove segments to use single length' : undefined}
              style={{
                flex: 1, padding: '9px 12px', borderRadius: 6, border: 'none', background: fenceConfigMode === 'single' ? colors.greenBg : 'transparent',
                color: segmentLengths.length > 1 ? colors.textDisabled : (fenceConfigMode === 'single' ? colors.green : colors.textLabel), fontWeight: 600, fontSize: fontSizes.md, cursor: segmentLengths.length > 1 ? 'not-allowed' : 'pointer', opacity: segmentLengths.length > 1 ? 0.5 : 1
              }}
            >
              Single length
            </button>
            <button
              type="button"
              onClick={() => setFenceConfigMode('segments')}
              style={{
                flex: 1, padding: '9px 12px', borderRadius: 6, border: 'none', background: fenceConfigMode === 'segments' ? 'rgba(34, 197, 94, 0.1)' : 'transparent',
                color: fenceConfigMode === 'segments' ? colors.green : colors.textLabel, fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer'
              }}
            >
              Segments ({segmentLengths.length})
            </button>
          </div>
          <div style={{ fontSize: fontSizes.sm, color: colors.textLabel, marginTop: 6 }}>
            Total length: <strong style={{ color: colors.textPrimaryLight }}>{totalLengthCanvas.toFixed(3)} m</strong>
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">{t('calculator:input_fence_length_m')}</label>
        <input
          type="number"
          value={length}
          onChange={(e) => setLength(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder={t('calculator:placeholder_enter_length_m')}
          readOnly={canvasMode && fenceConfigMode === 'single' && totalLengthCanvas > 0}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">{t('calculator:input_fence_height_m')}</label>
        <input
          type="number"
          value={height}
          onChange={(e) => setHeight(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder={t('calculator:placeholder_enter_height_m')}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">{t('calculator:input_slat_width_cm')}</label>
        <select
          value={slatWidth}
          onChange={(e) => setSlatWidth(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        >
          <option value="10">10 cm</option>
          <option value="12">12 cm</option>
          <option value="15">15 cm</option>
        </select>
      </div>

      {fenceType === 'horizontal' && (
        <div>
          <label className="block text-sm font-medium text-gray-700">{t('calculator:input_slat_length_cm')}</label>
          <select
            value={slatLength}
            onChange={(e) => setSlatLength(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="180">180 cm</option>
            <option value="360">360 cm</option>
          </select>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">{t('calculator:input_postmix_per_post_bags')}</label>
        <input
          type="number"
          value={postmixPerPost}
          onChange={(e) => setPostmixPerPost(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder={t('calculator:placeholder_enter_postmix')}
          min="0"
          step="0.1"
        />
      </div>

      {!isInProjectCreating && (
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={calculateTransport}
            onChange={(e) => setCalculateTransport(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">{t('calculator:calculate_transport_time_label')}</span>
        </label>
      )}

      {/* Transport Carrier Selection */}
      {!isInProjectCreating && calculateTransport && (
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

      <Button variant="accent" color={colors.accentBlue} onClick={calculate} disabled={isLoading}>
        {isLoading ? t('calculator:loading_in_progress') : t('calculator:calculate_button')}
      </Button>

      {calculationError && (
        <div className="mt-4 p-4 bg-red-900/90 border border-red-600 rounded-lg text-white">
          {calculationError}
        </div>
      )}

      {totalHours !== null && (
        <div className="mt-6 space-y-4" ref={resultsRef}>
          {segmentResults.length > 1 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: colors.textCool, marginBottom: 8 }}>Fence segments</div>
              <div style={{ background: colors.bgDeep, border: `1px solid ${colors.bgDeepBorder}`, borderRadius: radii.lg, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 70px 70px 80px 70px', padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '0.68rem', fontWeight: 700, color: colors.textLabel, textTransform: 'uppercase' }}>
                  <span>#</span>
                  <span>{t('calculator:length_label')}</span>
                  <span style={{ textAlign: 'center' }}>{t('calculator:rails_label')}</span>
                  <span style={{ textAlign: 'center' }}>{t('calculator:slats_label')}</span>
                  <span style={{ textAlign: 'center' }}>{t('calculator:remainder_label')}</span>
                  <span style={{ textAlign: 'center' }}>{t('calculator:posts_label')}</span>
                </div>
                {segmentResults.map((seg, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 70px 70px 80px 70px', alignItems: 'center', padding: '10px 12px', borderBottom: idx < segmentResults.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', background: idx % 2 === 1 ? 'rgba(255,255,255,0.022)' : undefined, fontSize: '0.82rem' }}>
                    <span style={{ fontWeight: 600, color: colors.textLabel }}>{idx + 1}</span>
                    <span style={{ fontWeight: 600, color: colors.textPrimaryLight }}>{seg.lengthM.toFixed(2)} m</span>
                    <span style={{ textAlign: 'center', color: colors.textPrimaryLight }}>{seg.rails}</span>
                    <span style={{ textAlign: 'center', color: colors.textPrimaryLight }}>{seg.slats}</span>
                    <span style={{ textAlign: 'center', color: seg.remainderCm > 0 ? colors.amber : colors.textLabel }}>{seg.remainderCm.toFixed(0)} cm</span>
                    <span style={{ textAlign: 'center', color: colors.textPrimaryLight }}>{seg.posts}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <h3 className="text-lg font-medium">{t('calculator:total_labor_hours_label')} <span className="text-blue-600">{totalHours.toFixed(2)} {t('calculator:hours_abbreviation')}</span></h3>
            
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
                        {translateUnit(material.unit, t)}
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
                  {t('calculator:total_cost_colon')}{' '}
                  {materials.some(m => m.total_price !== null) 
                    ? `£${materials.reduce((sum: number, m: Material) => sum + (m.total_price || 0), 0).toFixed(2)}`
                    : t('calculator:not_available')}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FenceCalculator;
