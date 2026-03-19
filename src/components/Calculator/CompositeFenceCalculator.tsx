import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { carrierSpeeds, getMaterialCapacity } from '../../constants/materialCapacity';
import { translateTaskName, translateUnit, translateMaterialName } from '../../lib/translationMap';
import { colors, fonts, fontSizes, fontWeights, spacing, radii, gradients } from '../../themes/designTokens';
import { Card, DataTable, TextInput, SelectDropdown, Checkbox, CalculatorInputGrid, Button } from '../../themes/uiComponents';

interface CompositeFenceCalculatorProps {
  onResultsChange?: (results: any) => void;
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
  'size (in tones)': number | null;
  speed_m_per_hour?: number | null;
  company_id?: string | null;
  created_at?: string;
  description?: string | null;
  in_use_quantity?: number;
  quantity?: number;
  status?: string;
  type?: string;
  updated_at?: string;
}

const CompositeFenceCalculator: React.FC<CompositeFenceCalculatorProps> = ({ 
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
  selectedExcavator: _propSelectedExcavator,
  recalculateTrigger = 0
}) => {
  const { t } = useTranslation(['calculator', 'utilities', 'common', 'units']);
  const companyId = useAuthStore(state => state.getCompanyId());

  const initLength = savedInputs?.length != null ? String(savedInputs.length) : (initialLength != null ? initialLength.toFixed(3) : '');
  const [length, setLength] = useState(initLength);
  const [height, setHeight] = useState(savedInputs?.height ?? '');
  useEffect(() => {
    if (savedInputs?.length != null) setLength(String(savedInputs.length));
    else if (initialLength != null && isInProjectCreating) setLength(initialLength.toFixed(3));
  }, [savedInputs?.length, initialLength, isInProjectCreating]);
  const [compositeSlatWidth, setCompositeSlatWidth] = useState(savedInputs?.compositeSlatWidth ?? '');
  const [slatLength, setSlatLength] = useState(savedInputs?.slatLength ?? '360');
  const [postmixPerPost, setPostmixPerPost] = useState<string>(savedInputs?.postmixPerPost ?? '');
  useEffect(() => {
    if (onInputsChange && isInProjectCreating) {
      onInputsChange({ length, height, compositeSlatWidth, slatLength, postmixPerPost });
    }
  }, [length, height, compositeSlatWidth, slatLength, postmixPerPost, onInputsChange, isInProjectCreating]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [totalHours, setTotalHours] = useState<number | null>(null);
  const [calculationError, setCalculationError] = useState<string | null>(null);
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

  // Fetch task template for fence installation
  const { data: layingTask, isLoading } = useQuery({
    queryKey: ['composite_fence_laying_task', companyId],
    queryFn: async () => {
      const taskName = 'standard composite fence';
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId || '')
        .eq('name', taskName)
        .single();
      
      if (error) {
        console.warn(`No composite fence laying task found: ${taskName}`, error);
        return null;
      }
      
      return data;
    },
    enabled: !!companyId
  });

  // Fetch task templates for digging holes and setting posts for composite
  const { data: taskTemplates = [] } = useQuery({
    queryKey: ['fence_post_tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .or('name.ilike.%digging holes%,name.ilike.%setting posts for composite%');

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
    const compSlatW = parseFloat(compositeSlatWidth);
    const slatL = parseFloat(slatLength);

    if (isNaN(l) || isNaN(h) || isNaN(compSlatW) || isNaN(slatL)) {
      setCalculationError(t('calculator:valid_numbers_required'));
      return;
    }

    let posts = Math.ceil(l / 180) + 1; // One post every 1.8m (180cm) + 1 extra post
    posts = Math.max(posts, 2); // Minimum 2 posts

    // Calculate slats needed - HORIZONTAL FENCE LOGIC (NO GAPS - composite fence)
    // slatsPerLength = how many slats fit per row (fence length / slat length)
    let slatsPerLength = Math.ceil(l / slatL); // How many slats fit across the length
    // slatsPerRow = how many rows fit in height (height / composite slat width, NO GAPS)
    let slatsPerRow = Math.ceil(h / compSlatW); // How many rows fit in height
    let slatsNeeded = slatsPerLength * slatsPerRow; // Total slats needed

    const postmix = parseFloat(postmixPerPost) || 0;
    const totalPostmix = posts * postmix;

    // Calculate labor hours - based on boards count (unit: board, estimated_hours per board)
    let mainTaskHours = 0;
    if (layingTask?.estimated_hours !== undefined && layingTask?.estimated_hours !== null && slatsNeeded > 0) {
      mainTaskHours = slatsNeeded * layingTask.estimated_hours;
    }

    const layingUnit = layingTask?.unit || 'board';

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
        task: 'Composite Fence Installation',
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

    // Add setting posts for composite task
    const settingPostsTask = taskTemplates?.find(t => t.name?.toLowerCase().includes('setting posts for composite'));
    if (settingPostsTask && settingPostsTask.estimated_hours && settingPostsTask.name) {
      breakdown.push({
        task: settingPostsTask.name,
        hours: posts * settingPostsTask.estimated_hours,
        amount: posts ? `${posts} posts` : '0',
        unit: 'posts'
      });
    }

    // Transport calculations - slats on foot
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

      // Calculate slats transport - on foot (2 slats per trip for composite)
      if (slatsNeeded > 0) {
        const slatsPerTrip = 2;
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
      { name: 'Composite Posts', amount: posts, unit: 'posts', price_per_unit: null, total_price: null },
      { name: 'Composite Slats', amount: slatsNeeded, unit: 'slats', price_per_unit: null, total_price: null },
      { name: 'Postmix', amount: totalPostmix, unit: 'bags', price_per_unit: null, total_price: null }
    ];

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
        name: 'Composite Fence Installation',
        amount: layingItem ? parseInt(layingItem.amount, 10) || 0 : 0,
        unit: layingItem?.unit || 'board',
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
  }, [totalHours, materials, taskBreakdown, length, onResultsChange]);

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
        {t('calculator:composite_fence_calculator_title')}
      </h2>
      <p style={{ fontSize: fontSizes.base, color: colors.textDim, fontFamily: fonts.body, lineHeight: 1.5 }}>
        Calculate materials, time, and costs for composite fence installation projects.
      </p>

      <Card padding={`${spacing["6xl"]}px ${spacing["6xl"]}px ${spacing.md}px`} style={{ marginBottom: spacing["5xl"] }}>
        <CalculatorInputGrid columns={2}>
          <TextInput
            label={t('calculator:fence_length_m_label')}
            value={length}
            onChange={setLength}
            placeholder={t('calculator:enter_length_meters')}
            unit="m"
          />
          <TextInput
            label={t('calculator:fence_height_m_label')}
            value={height}
            onChange={setHeight}
            placeholder={t('calculator:enter_height_meters')}
            unit="m"
          />
        </CalculatorInputGrid>

        <CalculatorInputGrid columns={2}>
          <TextInput
            label={t('calculator:composite_slat_width_cm_label')}
            value={compositeSlatWidth}
            onChange={setCompositeSlatWidth}
            placeholder={t('calculator:enter_composite_slat_width')}
            unit="cm"
          />
          <SelectDropdown
            label={t('calculator:composite_slat_length_cm_label')}
            value={slatLength + ' cm'}
            options={['180 cm', '360 cm']}
            onChange={(v) => setSlatLength(v.replace(/\s*cm\s*$/, ''))}
            placeholder={t('calculator:composite_slat_length_cm_label')}
          />
        </CalculatorInputGrid>

        <TextInput
          label={t('calculator:postmix_per_post_label')}
          value={postmixPerPost}
          onChange={setPostmixPerPost}
          placeholder={t('calculator:enter_postmix_per_post')}
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

        <Button variant="accent" color={colors.accentBlue} onClick={calculate} disabled={isLoading}>
          {isLoading ? t('calculator:loading_in_progress') : t('calculator:calculate_button')}
        </Button>

      {calculationError && (
        <div className="mt-4 p-4 rounded-lg" style={{ backgroundColor: colors.red, border: `1px solid ${colors.redLight}`, color: colors.textOnAccent }}>
          {calculationError}
        </div>
      )}

      {totalHours !== null && (
        <div style={{ marginTop: spacing["6xl"], display: 'flex', flexDirection: 'column', gap: spacing["5xl"] }} ref={resultsRef}>
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

export default CompositeFenceCalculator;
