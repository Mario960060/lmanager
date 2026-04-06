import React, { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { carrierSpeeds, getMaterialCapacity, DEFAULT_CARRIER_SPEED_M_PER_H } from '../../constants/materialCapacity';
import { translateTaskName, translateUnit } from '../../lib/translationMap';
import {
  colors,
  fonts,
  fontSizes,
  fontWeights,
  spacing,
  radii,
  gradients,
} from '../../themes/designTokens';
import {
  TextInput,
  CalculatorInputGrid,
  SelectDropdown,
  Checkbox,
  Button,
  Card,
  Label,
  DataTable,
} from '../../themes/uiComponents';

interface FoundationCalculatorProps {
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
  /** From Project Card Equipment tab — used when isInProjectCreating, inputs hidden */
  projectSoilType?: 'clay' | 'sand' | 'rock';
  projectDiggingMethod?: 'shovel' | 'small' | 'medium' | 'large';
}

interface TaskTemplate {
  id: string;
  name: string;
  unit: string;
  estimated_hours: number;
}

interface DiggingEquipment {
  id: string;
  name: string;
  type: string;
  "size (in tones)": number | null;
}

const FoundationCalculator: React.FC<FoundationCalculatorProps> = ({
  onResultsChange,
  onInputsChange,
  isInProjectCreating = false,
  initialLength,
  savedInputs = {},
  calculateTransport: propCalculateTransport,
  selectedTransportCarrier: propSelectedTransportCarrier,
  transportDistance: propTransportDistance,
  carriers: propCarriers = [],
  selectedExcavator: propSelectedExcavator,
  recalculateTrigger = 0,
  projectSoilType: propProjectSoilType,
  projectDiggingMethod: propProjectDiggingMethod,
}) => {
  const { t } = useTranslation(['calculator', 'utilities', 'common', 'units']);
  const companyId = useAuthStore(state => state.getCompanyId());
  
  // Input states
  const initLength = savedInputs?.length != null ? String(savedInputs.length) : (initialLength != null ? initialLength.toFixed(3) : '');
  const [length, setLength] = useState<string>(initLength);
  useEffect(() => {
    if (savedInputs?.length != null) setLength(String(savedInputs.length));
    else if (initialLength != null && isInProjectCreating) setLength(initialLength.toFixed(3));
  }, [savedInputs?.length, initialLength, isInProjectCreating]);
  const [width, setWidth] = useState<string>(savedInputs?.width ?? '');
  const [depthCm, setDepthCm] = useState<string>(savedInputs?.depthCm ?? '');
  const [diggingMethod, setDiggingMethod] = useState<'shovel' | 'small' | 'medium' | 'large'>(savedInputs?.diggingMethod ?? 'shovel');
  const [soilType, setSoilType] = useState<'clay' | 'sand' | 'rock'>(savedInputs?.soilType ?? 'clay');
  const effectiveDiggingMethod = isInProjectCreating && propProjectDiggingMethod ? propProjectDiggingMethod : diggingMethod;
  const effectiveSoilType = isInProjectCreating && propProjectSoilType ? propProjectSoilType : soilType;
  useEffect(() => {
    if (onInputsChange && isInProjectCreating) {
      onInputsChange({ length, width, depthCm, diggingMethod: effectiveDiggingMethod, soilType: effectiveSoilType });
    }
  }, [length, width, depthCm, effectiveDiggingMethod, effectiveSoilType, onInputsChange, isInProjectCreating]);
  const [calculateTransport, setCalculateTransport] = useState<boolean>(false);
  const [selectedTransportCarrier, setSelectedTransportCarrier] = useState<DiggingEquipment | null>(null);
  const [transportDistance, setTransportDistance] = useState<string>('30');
  const [carriersLocal, setCarriersLocal] = useState<DiggingEquipment[]>([]);
  const effectiveCalculateTransport = isInProjectCreating ? (propCalculateTransport ?? false) : calculateTransport;
  const effectiveSelectedTransportCarrier = isInProjectCreating ? (propSelectedTransportCarrier ?? null) : selectedTransportCarrier;
  const effectiveTransportDistance = isInProjectCreating && propTransportDistance ? propTransportDistance : transportDistance;
  const carriers = propCarriers && propCarriers.length > 0 ? propCarriers : carriersLocal;

  // Result states
  const [totalHours, setTotalHours] = useState<number | null>(null);
  const [taskBreakdown, setTaskBreakdown] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [calculationError, setCalculationError] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Constants
  const STANDARD_EXCAVATION = {
    length: 15,    // meters
    width: 0.6,    // meters
    depth: 0.6,    // meters
    volume: 5.4    // m³
  };

  const MANUAL_DIGGING_RATE = 0.45; // m³/hour

  const DIMENSION_WEIGHT = {
    length: 0.5,   // 50%
    width: 0.3,    // 30%
    depth: 0.2     // 20%
  };

  // Fetch excavation tasks from database
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

  const SOIL_DENSITY = {
    clay: 1.5,      // tonnes per m³
    sand: 1.6,      // tonnes per m³
    rock: 2.2       // tonnes per m³
  };

  // Loose volume coefficients (after excavation, soil expands)
  const LOOSE_VOLUME_COEFFICIENT = {
    clay: 1.2,      // 20% increase (1.1-1.3 average)
    sand: 1.025,    // 2.5% increase (1.0-1.05 average)
    rock: 1.075     // 7.5% increase (1.05-1.1 average)
  };

  // Concrete mix ratios (per m³)
  const CONCRETE_MIX = {
    cement: 350,    // kg per m³
    sand: 700,      // kg per m³
    aggregate: 1050 // kg per m³
  };

  // Scroll to results when they appear
  useEffect(() => {
    if (totalHours !== null && resultsRef.current) {
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [totalHours]);

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
        
        const carriers = (carrierData || []).map(carrier => ({
          id: carrier.id,
          name: carrier.name,
          type: carrier.type,
          "size (in tones)": carrier["size (in tones)"] || null
        }));
        setCarriersLocal(carriers);
      } catch (error) {
        console.error('Error fetching equipment:', error);
      }
    };
    
    if (effectiveCalculateTransport) {
      fetchEquipment();
    }
  }, [effectiveCalculateTransport]);

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

  const calculate = () => {
    // Validation
    if (!length || !width || !depthCm) {
      setCalculationError(t('calculator:fill_all_required_fields'));
      return;
    }

    setCalculationError(null);

    try {
      const lengthNum = parseFloat(length);
      const widthNum = parseFloat(width);
      const depthNum = parseFloat(depthCm) / 100; // Convert cm to meters

      // Validate positive numbers
      if (lengthNum <= 0 || widthNum <= 0 || depthNum <= 0) {
        setCalculationError(t('calculator:positive_dimensions_required'));
        return;
      }

      // 1. Calculate actual volume
      const actualVolume = lengthNum * widthNum * depthNum;

      // 2. Calculate relative coefficients
      const lengthRel = lengthNum / STANDARD_EXCAVATION.length;
      const widthRel = widthNum / STANDARD_EXCAVATION.width;
      const depthRel = depthNum / STANDARD_EXCAVATION.depth;

      // 3. Calculate time with dimension weights
      const timeBaseManual = actualVolume / MANUAL_DIGGING_RATE;
      const dimensionAdjustment = 
        (DIMENSION_WEIGHT.length * lengthRel) +
        (DIMENSION_WEIGHT.width * widthRel) +
        (DIMENSION_WEIGHT.depth * depthRel);
      const timeWithDimensions = timeBaseManual * dimensionAdjustment;

      // 4. Get final time using task template or fallback
      const excavationHours = getTaskHours(effectiveDiggingMethod, timeWithDimensions);

      // 5. Calculate material weight (excavated soil)
      const soilDensity = SOIL_DENSITY[effectiveSoilType];
      const excavatedSoilTonnes = actualVolume * soilDensity;
      
      // Calculate loose volume after excavation (soil expands)
      const looseVolumeCoefficient = LOOSE_VOLUME_COEFFICIENT[effectiveSoilType];
      const looseVolume = actualVolume * looseVolumeCoefficient;

      // 6. Calculate concrete components
      // const cementKg = actualVolume * CONCRETE_MIX.cement; // Available for future use
      // const sandKg = actualVolume * CONCRETE_MIX.sand; // Not used in current materials list
      const aggregateKg = actualVolume * CONCRETE_MIX.aggregate;

      // const cementBags = Math.ceil(cementKg / 25); // 25kg bags - available for future use
      // const sandTonnes = sandKg / 1000; // Not used in materials list but available for future use
      const aggregateTonnes = aggregateKg / 1000;

      // Get transport distance in meters
      const transportDistanceMeters = parseFloat(effectiveTransportDistance) || 30;

      // Calculate material transport times if "Calculate transport time" is checked
      let soilTransportTime = 0;

      if (effectiveCalculateTransport) {
        let carrierSizeForTransport = 0.125;
        
        if (effectiveSelectedTransportCarrier) {
          carrierSizeForTransport = effectiveSelectedTransportCarrier["size (in tones)"] || 0.125;
        }

        // Calculate soil transport
        if (excavatedSoilTonnes > 0) {
          const soilResult = calculateMaterialTransportTime(excavatedSoilTonnes, carrierSizeForTransport, 'soil', transportDistanceMeters);
          soilTransportTime = soilResult.totalTransportTime;
        }
      }

      // Build task breakdown (single excavation task)
      const breakdown = [
        {
          task: 'Foundation Excavation',
          hours: excavationHours,
          amount: actualVolume.toFixed(2),
          unit: 'm³'
        }
      ];

      // Add transport task if applicable
      if (effectiveCalculateTransport && soilTransportTime > 0) {
        breakdown.push({
          task: 'transport soil',
          hours: soilTransportTime,
          amount: excavatedSoilTonnes.toFixed(2),
          unit: 'tonnes'
        });
      }

      // Build materials list (names use keys for translation in render)
      const soilTypeKey = effectiveSoilType === 'clay' ? 'soil_type_clay' : effectiveSoilType === 'sand' ? 'soil_type_sand' : 'soil_type_rock';
      const materialsList = [
        { 
          name: `Excavated ${effectiveSoilType.charAt(0).toUpperCase() + effectiveSoilType.slice(1)} Soil (loose volume)`, 
          materialKey: 'excavated_soil_loose_format' as const,
          materialKeyParams: { type: t(`calculator:${soilTypeKey}`) },
          amount: looseVolume * soilDensity, 
          unit: 'tonnes',
          price_per_unit: null,
          total_price: null
        },
        { 
          name: 'Aggregate (for concrete)', 
          materialKey: 'aggregate_for_concrete' as const,
          amount: aggregateTonnes, 
          unit: 'tonnes',
          price_per_unit: null,
          total_price: null
        }
      ];

      const hours = excavationHours + soilTransportTime;

      setTotalHours(hours);
      setTaskBreakdown(breakdown);
      setMaterials(materialsList);

      if (onResultsChange) {
        // Use the same excavated soil tonnage as shown in materials
        const materialExcavatedTonnes = materialsList.length > 0 ? materialsList[0].amount : 0;
        
        onResultsChange({
          name: 'Foundation Excavation & Concrete',
          amount: actualVolume,
          unit: 'm³',
          hours_worked: hours,
          diggingMethod: effectiveDiggingMethod,
          excavatedSoilTonnes: materialExcavatedTonnes,
          materials: materialsList.map(material => ({
            name: material.name,
            quantity: material.amount,
            unit: material.unit
          })),
          taskBreakdown: breakdown
        });
      }
    } catch (error) {
      setCalculationError(t('calculator:calculation_error'));
      console.error(error);
    }
  };

  // Recalculate when project settings (transport, equipment) change
  useEffect(() => {
    if (recalculateTrigger > 0 && isInProjectCreating) {
      calculate();
    }
  }, [recalculateTrigger]);

  const clearAll = () => {
    setLength('');
    setWidth('');
    setDepthCm('');
    setDiggingMethod('shovel');
    setSoilType('clay');
    setCalculateTransport(false);
    setSelectedTransportCarrier(null);
    setTransportDistance('30');
    setTotalHours(null);
    setTaskBreakdown([]);
    setMaterials([]);
    setCalculationError(null);
  };

  return (
    <div style={{ fontFamily: fonts.body, display: 'flex', flexDirection: 'column', gap: spacing["6xl"] }}>
      <h2 style={{ fontSize: fontSizes["2xl"], fontWeight: fontWeights.bold, color: colors.textPrimary, fontFamily: fonts.display, marginBottom: spacing.sm }}>
        {t('calculator:foundation_calculator_title_alt')}
      </h2>
      <p style={{ fontSize: fontSizes.base, color: colors.textDim, fontFamily: fonts.body, lineHeight: 1.5 }}>
        {t('calculator:foundation_calculator_description')}
      </p>

      <Card padding={`${spacing["6xl"]}px ${spacing["6xl"]}px ${spacing.md}px`} style={{ marginBottom: spacing["5xl"] }}>
        <CalculatorInputGrid columns={3}>
          <TextInput label={t('calculator:input_length_m')} value={length} onChange={setLength} placeholder={t('calculator:placeholder_enter_length_m')} unit="m" />
          <TextInput label={t('calculator:input_width_m')} value={width} onChange={setWidth} placeholder={t('calculator:placeholder_enter_width')} unit="m" />
          <TextInput label={t('calculator:input_depth_in_cm')} value={depthCm} onChange={setDepthCm} placeholder={t('calculator:placeholder_enter_depth_cm')} unit="cm" />
        </CalculatorInputGrid>

        {!isInProjectCreating && (
          <>
            <SelectDropdown
              label={t('calculator:digging_method')}
              value={diggingMethod === 'shovel' ? t('calculator:digging_method_shovel') : diggingMethod === 'small' ? t('calculator:digging_method_small') : diggingMethod === 'medium' ? t('calculator:digging_method_medium') : t('calculator:digging_method_large')}
              options={[t('calculator:digging_method_shovel'), t('calculator:digging_method_small'), t('calculator:digging_method_medium'), t('calculator:digging_method_large')]}
              onChange={(val) => setDiggingMethod(val === t('calculator:digging_method_shovel') ? 'shovel' : val === t('calculator:digging_method_small') ? 'small' : val === t('calculator:digging_method_medium') ? 'medium' : 'large')}
              placeholder={t('calculator:digging_method')}
            />
            <SelectDropdown
              label={t('calculator:soil_type')}
              value={soilType === 'clay' ? t('calculator:soil_type_clay') : soilType === 'sand' ? t('calculator:soil_type_sand') : t('calculator:soil_type_rock')}
              options={[t('calculator:soil_type_clay'), t('calculator:soil_type_sand'), t('calculator:soil_type_rock')]}
              onChange={(val) => setSoilType(val === t('calculator:soil_type_sand') ? 'sand' : val === t('calculator:soil_type_rock') ? 'rock' : 'clay')}
              placeholder={t('calculator:soil_type')}
            />
          </>
        )}

        {!isInProjectCreating && (
          <Checkbox label={t('calculator:calculate_transport_time_label')} checked={calculateTransport} onChange={setCalculateTransport} />
        )}

        {!isInProjectCreating && effectiveCalculateTransport && (
          <>
            <div>
              <Label>{t('calculator:transport_carrier')}</Label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm, marginTop: spacing.sm }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: `${spacing.lg}px ${spacing["2xl"]}px`,
                    cursor: 'pointer',
                    borderRadius: radii.lg,
                    border: `1px solid ${effectiveSelectedTransportCarrier === null ? colors.accentBlueBorder : colors.borderLight}`,
                    background: effectiveSelectedTransportCarrier === null ? colors.bgHover : 'transparent',
                  }}
                  onClick={() => setSelectedTransportCarrier(null)}
                >
                  <div style={{
                    width: 16,
                    height: 16,
                    borderRadius: radii.full,
                    border: `2px solid ${effectiveSelectedTransportCarrier === null ? colors.accentBlue : colors.borderMedium}`,
                    marginRight: spacing.md,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    {effectiveSelectedTransportCarrier === null && (
                      <div style={{ width: 8, height: 8, borderRadius: radii.full, background: colors.accentBlue }} />
                    )}
                  </div>
                  <span style={{ fontSize: fontSizes.base, color: colors.textSecondary }}>{t('calculator:default_wheelbarrow')}</span>
                </div>
                {carriers.length > 0 && carriers.map((carrier) => (
                  <div
                    key={carrier.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: `${spacing.lg}px ${spacing["2xl"]}px`,
                      cursor: 'pointer',
                      borderRadius: radii.lg,
                      border: `1px solid ${effectiveSelectedTransportCarrier?.id === carrier.id ? colors.accentBlueBorder : colors.borderLight}`,
                      background: effectiveSelectedTransportCarrier?.id === carrier.id ? colors.bgHover : 'transparent',
                    }}
                    onClick={() => setSelectedTransportCarrier(carrier)}
                  >
                    <div style={{
                      width: 16,
                      height: 16,
                      borderRadius: radii.full,
                      border: `2px solid ${effectiveSelectedTransportCarrier?.id === carrier.id ? colors.accentBlue : colors.borderMedium}`,
                      marginRight: spacing.md,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      {effectiveSelectedTransportCarrier?.id === carrier.id && (
                        <div style={{ width: 8, height: 8, borderRadius: radii.full, background: colors.accentBlue }} />
                      )}
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md, paddingTop: spacing.xl, width: '100%' }}>
          <Button onClick={calculate} variant="primary" fullWidth disabled={!length || !width || !depthCm}>
            {t('calculator:calculate_button')}
          </Button>
          <Button onClick={clearAll} variant="secondary" fullWidth>
            {t('calculator:clear_button')}
          </Button>
        </div>

        {calculationError && (
          <div style={{ padding: spacing.base, background: 'rgba(239,68,68,0.15)', border: `1px solid ${colors.red}`, borderRadius: radii.lg, color: colors.textPrimary, marginTop: spacing.xl }}>
            {calculationError}
          </div>
        )}

        {totalHours !== null && (
          <div ref={resultsRef} style={{ marginTop: spacing["6xl"], display: 'flex', flexDirection: 'column', gap: spacing["5xl"] }}>
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
                {taskBreakdown.map((task: any, index: number) => (
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
                    <span style={{ fontSize: fontSizes.base, color: colors.textMuted, fontFamily: fonts.body }}>
                      {translateTaskName(task.task, t)} ({task.amount} {translateUnit(task.unit, t)})
                    </span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: spacing.xs }}>
                      <span style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.bold, color: colors.textSecondary, fontFamily: fonts.display }}>{task.hours.toFixed(2)}</span>
                      <span style={{ fontSize: fontSizes.sm, color: colors.textFaint, fontFamily: fonts.body }}>{t('calculator:hours_label')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            <h3 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.bold, color: colors.textSecondary, fontFamily: fonts.display, letterSpacing: '0.3px', marginBottom: spacing["2xl"] }}>
              {t('calculator:material_quantification')}
            </h3>
            <DataTable
              columns={[
                { key: 'name', label: t('calculator:table_material_header'), width: '2fr' },
                { key: 'quantity', label: t('calculator:table_quantity_header'), width: '1fr' },
                { key: 'unit', label: t('calculator:table_unit_header'), width: '1fr' },
              ]}
              rows={materials.map((m: any) => ({
                name: <span style={{ fontSize: fontSizes.base, color: colors.textMuted, fontFamily: fonts.body }}>{m.materialKey ? t(`calculator:${m.materialKey}`, m.materialKeyParams || {}) : m.name}</span>,
                quantity: <span style={{ fontSize: fontSizes.base, color: colors.textSubtle }}>{m.amount.toFixed(2)}</span>,
                unit: <span style={{ fontSize: fontSizes.sm, color: colors.textDim }}>{translateUnit(m.unit, t)}</span>,
              }))}
            />
          </div>
        )}
      </Card>
    </div>
  );
};

export default FoundationCalculator;
