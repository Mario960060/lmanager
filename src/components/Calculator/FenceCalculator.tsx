import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { carrierSpeeds, getMaterialCapacity, FOOT_CARRY_SPEED_M_PER_H, DEFAULT_CARRIER_SPEED_M_PER_H } from '../../constants/materialCapacity';
import { translateTaskName, translateUnit, translateMaterialName } from '../../lib/translationMap';
import {
  FENCE_NAILS_45_MM,
  FENCE_NAILS_75_MM,
  FENCE_VERTICAL_NAILS_PER_SLAT,
  FENCE_RAIL_NAILS_PER_POST,
  fenceSlatNailsPerSlatAlongLength,
} from '../../lib/fenceNailMaterials';
import { colors, fonts, fontSizes, fontWeights, radii, spacing, gradients } from '../../themes/designTokens';
import { Button, Card, DataTable, TextInput, SelectDropdown, Checkbox, CalculatorInputGrid } from '../../themes/uiComponents';

/** Matches DB materials_template / materials rows for horizontal fence (length × width in cm). */
const HORIZONTAL_SLAT_MATERIAL_RE = /^Horizontal fence slat (\d+)×(\d+) cm$/;

const HORIZONTAL_SLAT_FALLBACK_NAMES = [
  'Horizontal fence slat 180×10 cm',
  'Horizontal fence slat 180×15 cm',
  'Horizontal fence slat 180×20 cm',
  'Horizontal fence slat 360×10 cm',
  'Horizontal fence slat 360×15 cm',
  'Horizontal fence slat 360×20 cm',
  'Horizontal fence slat 420×10 cm',
  'Horizontal fence slat 420×15 cm',
  'Horizontal fence slat 420×20 cm',
];

function parseHorizontalSlatMaterial(name: string): { slatL: number; slatW: number } | null {
  const m = name.match(HORIZONTAL_SLAT_MATERIAL_RE);
  if (!m) return null;
  return { slatL: parseInt(m[1], 10), slatW: parseInt(m[2], 10) };
}

function sortHorizontalSlatNames(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const pa = parseHorizontalSlatMaterial(a);
    const pb = parseHorizontalSlatMaterial(b);
    if (!pa || !pb) return a.localeCompare(b);
    if (pa.slatL !== pb.slatL) return pa.slatL - pb.slatL;
    return pa.slatW - pb.slatW;
  });
}

function defaultHorizontalSlatMaterialName(saved: Record<string, any> | undefined): string {
  if (saved?.horizontalSlatMaterialName && typeof saved.horizontalSlatMaterialName === 'string') {
    return saved.horizontalSlatMaterialName;
  }
  const w = saved?.slatWidth ?? '10';
  const len = saved?.slatLength ?? '180';
  return `Horizontal fence slat ${len}×${w} cm`;
}

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
  const [horizontalSlatMaterialName, setHorizontalSlatMaterialName] = useState(() =>
    defaultHorizontalSlatMaterialName(savedInputs)
  );
  const [postmixPerPost, setPostmixPerPost] = useState<string>(savedInputs?.postmixPerPost ?? '');
  const lastInputsSentRef = useRef<string>('');
  useEffect(() => {
    if (!onInputsChange || !isInProjectCreating) return;
    const inputs: Record<string, any> = {
      length,
      height,
      slatWidth,
      slatLength,
      postmixPerPost,
      ...(fenceType === 'horizontal' ? { horizontalSlatMaterialName } : {}),
    };
    if (canvasMode && fenceConfigMode === 'single' && totalLengthCanvas > 0) {
      inputs.segmentLengths = [totalLengthCanvas];
    } else if (segmentLengths.length > 0) {
      inputs.segmentLengths = segmentLengths;
    }
    const key = JSON.stringify(inputs);
    if (lastInputsSentRef.current === key) return;
    lastInputsSentRef.current = key;
    onInputsChange(inputs);
  }, [
    length,
    height,
    slatWidth,
    slatLength,
    postmixPerPost,
    horizontalSlatMaterialName,
    fenceType,
    segmentLengths,
    fenceConfigMode,
    canvasMode,
    totalLengthCanvas,
    onInputsChange,
    isInProjectCreating,
  ]);
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

  const { data: horizontalSlatMaterialNames = [] } = useQuery({
    queryKey: ['horizontal_fence_slat_materials', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('materials')
        .select('name')
        .eq('company_id', companyId || '')
        .ilike('name', 'Horizontal fence slat%')
        .order('name');
      if (error) throw error;
      return (data ?? []).map((r: { name: string }) => r.name);
    },
    enabled: !!companyId && fenceType === 'horizontal',
  });

  const horizontalSlatOptions = useMemo(() => {
    return sortHorizontalSlatNames(
      horizontalSlatMaterialNames.length > 0 ? horizontalSlatMaterialNames : HORIZONTAL_SLAT_FALLBACK_NAMES
    );
  }, [horizontalSlatMaterialNames]);

  useEffect(() => {
    if (fenceType !== 'horizontal' || horizontalSlatOptions.length === 0) return;
    setHorizontalSlatMaterialName((prev) =>
      horizontalSlatOptions.includes(prev) ? prev : horizontalSlatOptions[0]!
    );
  }, [fenceType, horizontalSlatOptions]);

  useEffect(() => {
    if (fenceType !== 'horizontal') return;
    const p = parseHorizontalSlatMaterial(horizontalSlatMaterialName);
    if (p) {
      setSlatWidth(String(p.slatW));
      setSlatLength(String(p.slatL));
    }
  }, [fenceType, horizontalSlatMaterialName]);

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
    const carrierSpeed = carrierSpeedData?.speed || DEFAULT_CARRIER_SPEED_M_PER_H;
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
    let slatW = parseFloat(slatWidth);
    let slatL = parseFloat(slatLength);
    if (fenceType === 'horizontal') {
      const p = parseHorizontalSlatMaterial(horizontalSlatMaterialName);
      if (p) {
        slatW = p.slatW;
        slatL = p.slatL;
      }
    }

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
      if (posts > 0) {
        const postsPerTrip = 1; // 1 post per person per trip
        const trips = Math.ceil(posts / postsPerTrip);
        const timePerTrip = (parseFloat(effectiveTransportDistance) || 30) * 2 / FOOT_CARRY_SPEED_M_PER_H;
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
        const timePerTrip = (parseFloat(effectiveTransportDistance) || 30) * 2 / FOOT_CARRY_SPEED_M_PER_H;
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
      {
        name: fenceType === 'vertical' ? (h <= 120 ? '1200 Fence Slats' : '1800 Fence Slats') : horizontalSlatMaterialName,
        amount: slatsNeeded,
        unit: 'slats',
        price_per_unit: null,
        total_price: null,
      },
      { name: 'Postmix', amount: totalPostmix, unit: 'bags', price_per_unit: null, total_price: null }
    ];

    if (fenceType === 'vertical') {
      materialsList.push({ name: 'Fence Rails', amount: fenceRails, unit: 'rails', price_per_unit: null, total_price: null });
    }

    if (fenceType === 'vertical') {
      materialsList.push({
        name: FENCE_NAILS_45_MM,
        amount: FENCE_VERTICAL_NAILS_PER_SLAT * slatsNeeded,
        unit: 'pieces',
        price_per_unit: null,
        total_price: null,
      });
      materialsList.push({
        name: FENCE_NAILS_75_MM,
        amount: FENCE_RAIL_NAILS_PER_POST * posts,
        unit: 'pieces',
        price_per_unit: null,
        total_price: null,
      });
    } else {
      const nails45Horizontal = fenceSlatNailsPerSlatAlongLength(slatL) * slatsNeeded;
      materialsList.push({
        name: FENCE_NAILS_45_MM,
        amount: nails45Horizontal,
        unit: 'pieces',
        price_per_unit: null,
        total_price: null,
      });
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
    <div style={{ fontFamily: fonts.body, display: 'flex', flexDirection: 'column', gap: spacing["6xl"] }}>
      <h2 style={{ fontSize: fontSizes["2xl"], fontWeight: fontWeights.extrabold, color: colors.textPrimary, fontFamily: fonts.display, letterSpacing: '0.3px', margin: `${spacing.md}px 0 ${spacing.sm}px` }}>
        {fenceType === 'vertical' ? t('calculator:vertical_fence_calculator', { defaultValue: 'Vertical Fence Calculator' }) : t('calculator:horizontal_fence_calculator', { defaultValue: 'Horizontal Fence Calculator' })}
      </h2>
      <p style={{ fontSize: fontSizes.base, color: colors.textDim, fontFamily: fonts.body, lineHeight: 1.5 }}>
        Calculate materials, time, and costs for {fenceType} fence installation projects.
      </p>

      <Card padding={`${spacing["6xl"]}px ${spacing["6xl"]}px ${spacing.md}px`} style={{ marginBottom: spacing["5xl"] }}>
        {canvasMode && segmentLengths.length > 0 && (
          <div style={{ marginBottom: spacing["3xl"] }}>
            <div style={{ fontSize: fontSizes.sm, fontWeight: fontWeights.bold, color: colors.textSubtle, marginBottom: spacing.md }}>{t('calculator:fence_configuration_label')}</div>
            <div style={{ display: 'flex', background: colors.bgCardInner, borderRadius: radii.lg, border: `1px solid ${colors.borderDefault}`, padding: 3, gap: 3 }}>
              <button
                type="button"
                disabled={segmentLengths.length > 1}
                onClick={() => segmentLengths.length <= 1 && setFenceConfigMode('single')}
                title={segmentLengths.length > 1 ? 'Remove segments to use single length' : undefined}
                style={{
                  flex: 1, padding: `${spacing.lg}px ${spacing.xl}px`, borderRadius: radii.lg, border: 'none', background: fenceConfigMode === 'single' ? colors.accentBlueBg : 'transparent',
                  color: segmentLengths.length > 1 ? colors.textDisabled : (fenceConfigMode === 'single' ? colors.accentBlue : colors.textDim), fontWeight: fontWeights.semibold, fontSize: fontSizes.md, cursor: segmentLengths.length > 1 ? 'not-allowed' : 'pointer', opacity: segmentLengths.length > 1 ? 0.5 : 1
                }}
              >
                Single length
              </button>
              <button
                type="button"
                onClick={() => setFenceConfigMode('segments')}
                style={{
                  flex: 1, padding: `${spacing.lg}px ${spacing.xl}px`, borderRadius: radii.lg, border: 'none', background: fenceConfigMode === 'segments' ? colors.accentBlueBg : 'transparent',
                  color: fenceConfigMode === 'segments' ? colors.accentBlue : colors.textDim, fontWeight: fontWeights.semibold, fontSize: fontSizes.sm, cursor: 'pointer'
                }}
              >
                Segments ({segmentLengths.length})
              </button>
            </div>
            <div style={{ fontSize: fontSizes.sm, color: colors.textDim, marginTop: spacing.md }}>
              Total length: <strong style={{ color: colors.textPrimary }}>{totalLengthCanvas.toFixed(3)} m</strong>
            </div>
          </div>
        )}

        <CalculatorInputGrid columns={2}>
          <TextInput
            label={t('calculator:input_fence_length_m')}
            value={length}
            onChange={setLength}
            placeholder={t('calculator:placeholder_enter_length_m')}
            unit="m"
            readOnly={canvasMode && fenceConfigMode === 'single' && totalLengthCanvas > 0}
          />
          <TextInput
            label={t('calculator:input_fence_height_m')}
            value={height}
            onChange={setHeight}
            placeholder={t('calculator:placeholder_enter_height_m')}
            unit="m"
          />
        </CalculatorInputGrid>

        <CalculatorInputGrid columns={2}>
          {fenceType === 'vertical' ? (
            <SelectDropdown
              label={t('calculator:input_slat_width_cm')}
              value={slatWidth + ' cm'}
              options={['10 cm', '12 cm', '15 cm']}
              onChange={(v) => setSlatWidth(v.replace(/\s*cm\s*$/, ''))}
              placeholder={t('calculator:input_slat_width_cm')}
            />
          ) : (
            <SelectDropdown
              label={t('calculator:input_horizontal_fence_slat_material')}
              value={horizontalSlatMaterialName}
              options={horizontalSlatOptions}
              onChange={setHorizontalSlatMaterialName}
              placeholder={t('calculator:input_horizontal_fence_slat_material')}
            />
          )}
          <div />
        </CalculatorInputGrid>

        <TextInput
          label={t('calculator:input_postmix_per_post_bags')}
          value={postmixPerPost}
          onChange={setPostmixPerPost}
          placeholder={t('calculator:placeholder_enter_postmix')}
          unit="bags"
        />

        {!isInProjectCreating && (
          <Checkbox label={t('calculator:calculate_transport_time_label')} checked={calculateTransport} onChange={setCalculateTransport} />
        )}

        {!isInProjectCreating && calculateTransport && (
          <>
            <div>
              <label style={{ display: 'block', fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted, marginBottom: spacing.lg }}>{t('calculator:transport_carrier')}</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', padding: `${spacing.lg}px ${spacing["2xl"]}px`, cursor: 'pointer', borderRadius: radii.lg, background: !selectedTransportCarrier ? colors.bgHover : 'transparent', border: `1px solid ${!selectedTransportCarrier ? colors.accentBlueBorder : colors.borderLight}` }}
                  onClick={() => setSelectedTransportCarrier(null)}
                >
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
              value={transportDistance}
              onChange={setTransportDistance}
              placeholder={t('calculator:placeholder_enter_transport_distance')}
              unit="m"
              helperText={t('calculator:set_to_zero_no_transport')}
            />
          </>
        )}

      <Button variant="primary" fullWidth onClick={calculate} disabled={isLoading}>
        {isLoading ? t('calculator:loading_in_progress') : t('calculator:calculate_button')}
      </Button>

      {calculationError && (
        <div className="mt-4 p-4 rounded-lg" style={{ backgroundColor: colors.red, border: `1px solid ${colors.redLight}`, color: colors.textOnAccent }}>
          {calculationError}
        </div>
      )}

      {totalHours !== null && (
        <div style={{ marginTop: spacing["6xl"], display: 'flex', flexDirection: 'column', gap: spacing["5xl"] }} ref={resultsRef}>
          {segmentResults.length > 1 && (
            <div style={{ marginBottom: spacing["3xl"] }}>
              <div style={{ fontSize: fontSizes.sm, fontWeight: fontWeights.bold, color: colors.textSubtle, marginBottom: spacing.md }}>{t('calculator:fence_segments_label', { defaultValue: 'Fence segments' })}</div>
              <div style={{ background: colors.bgCardInner, border: `1px solid ${colors.borderDefault}`, borderRadius: radii["2xl"], overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 70px 70px 80px 70px', padding: `${spacing.md}px ${spacing.xl}px`, borderBottom: `1px solid ${colors.borderLight}`, fontSize: fontSizes.xs, fontWeight: fontWeights.bold, color: colors.textDim, textTransform: 'uppercase' }}>
                  <span>#</span>
                  <span>{t('calculator:length_label')}</span>
                  <span style={{ textAlign: 'center' }}>{t('calculator:rails_label')}</span>
                  <span style={{ textAlign: 'center' }}>{t('calculator:slats_label')}</span>
                  <span style={{ textAlign: 'center' }}>{t('calculator:remainder_label')}</span>
                  <span style={{ textAlign: 'center' }}>{t('calculator:posts_label')}</span>
                </div>
                {segmentResults.map((seg, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 70px 70px 80px 70px', alignItems: 'center', padding: `${spacing.lg}px ${spacing.xl}px`, borderBottom: idx < segmentResults.length - 1 ? `1px solid ${colors.borderLight}` : 'none', background: idx % 2 === 1 ? colors.bgTableRowAlt : undefined, fontSize: fontSizes.base }}>
                    <span style={{ fontWeight: fontWeights.semibold, color: colors.textDim }}>{idx + 1}</span>
                    <span style={{ fontWeight: fontWeights.semibold, color: colors.textSecondary }}>{seg.lengthM.toFixed(2)} m</span>
                    <span style={{ textAlign: 'center', color: colors.textSecondary }}>{seg.rails}</span>
                    <span style={{ textAlign: 'center', color: colors.textSecondary }}>{seg.slats}</span>
                    <span style={{ textAlign: 'center', color: seg.remainderCm > 0 ? colors.amber : colors.textDim }}>{seg.remainderCm.toFixed(0)} cm</span>
                    <span style={{ textAlign: 'center', color: colors.textSecondary }}>{seg.posts}</span>
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
                  {materials.some(m => m.total_price !== null) ? `£${materials.reduce((sum: number, m: Material) => sum + (m.total_price || 0), 0).toFixed(2)}` : t('calculator:not_available')}
                </span>
              </div>
            }
          />
        </div>
      )}
      </Card>
    </div>
  );
};

export default FenceCalculator;
