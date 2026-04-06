import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { carrierSpeeds, getMaterialCapacity, DEFAULT_CARRIER_SPEED_M_PER_H } from '../../constants/materialCapacity';
import { translateTaskName, translateUnit, translateMaterialName } from '../../lib/translationMap';
import { CompactorSelector, type CompactorOption } from './CompactorSelector';
import { calculateCompactingTime } from '../../lib/compactingCalculations';
import { colors, fonts, fontSizes, fontWeights, spacing, radii, gradients } from '../../themes/designTokens';
import { Spinner, Button, Card, DataTable, TextInput, Checkbox, CalculatorInputGrid } from '../../themes/uiComponents';

interface Material {
  name: string;
  amount: number;
  unit: string;
  price_per_unit: number | null;
  total_price: number | null;
}

interface Shape {
  points: { x: number; y: number }[];
  closed: boolean;
  calculatorInputs?: Record<string, any>;
}

interface NaturalTurfCalculatorProps {
  onResultsChange?: (results: any) => void;
  onInputsChange?: (inputs: Record<string, any>) => void;
  isInProjectCreating?: boolean;
  initialArea?: number;
  savedInputs?: Record<string, any>;
  shape?: Shape;
  calculateTransport?: boolean;
  setCalculateTransport?: (value: boolean) => void;
  selectedTransportCarrier?: any;
  setSelectedTransportCarrier?: (value: any) => void;
  transportDistance?: string;
  setTransportDistance?: (value: string) => void;
  carriers?: any[];
  selectedExcavator?: any;
  selectedCarrier?: any;
  selectedCompactor?: CompactorOption | null;
  recalculateTrigger?: number;
}

interface DiggingEquipment {
  id: string;
  name: string;
  type: string;
  "size (in tones)": number | null;
  speed_m_per_hour?: number | null;
}

const loadingSoilDiggerTimeEstimates = [
  { equipment: 'Shovel (1 Person)', sizeInTons: 0.02, timePerTon: 0.5 },
  { equipment: 'Digger 0.5T', sizeInTons: 0.5, timePerTon: 0.36 },
  { equipment: 'Digger 1T', sizeInTons: 1, timePerTon: 0.18 },
  { equipment: 'Digger 2T', sizeInTons: 2, timePerTon: 0.12 },
  { equipment: 'Digger 3-5T', sizeInTons: 3, timePerTon: 0.08 },
  { equipment: 'Digger 6-10T', sizeInTons: 6, timePerTon: 0.05 },
  { equipment: 'Digger 11-20T', sizeInTons: 11, timePerTon: 0.03 },
  { equipment: 'Digger 21-30T', sizeInTons: 21, timePerTon: 0.02 },
  { equipment: 'Digger 31-40T', sizeInTons: 31, timePerTon: 0.01 },
  { equipment: 'Digger 41-50T', sizeInTons: 41, timePerTon: 0.005 }
];

const findLoadingSoilTimeEstimate = (sizeInTons: number): number => {
  if (sizeInTons <= 0) return loadingSoilDiggerTimeEstimates[0].timePerTon;
  for (let i = 0; i < loadingSoilDiggerTimeEstimates.length - 1; i++) {
    if (
      sizeInTons >= loadingSoilDiggerTimeEstimates[i].sizeInTons &&
      sizeInTons < loadingSoilDiggerTimeEstimates[i + 1].sizeInTons
    ) {
      return loadingSoilDiggerTimeEstimates[i].timePerTon;
    }
  }
  return loadingSoilDiggerTimeEstimates[loadingSoilDiggerTimeEstimates.length - 1].timePerTon;
};

const NaturalTurfCalculator: React.FC<NaturalTurfCalculatorProps> = ({
  onResultsChange,
  onInputsChange,
  isInProjectCreating = false,
  initialArea,
  savedInputs = {},
  shape,
  calculateTransport: propCalculateTransport,
  setCalculateTransport: propSetCalculateTransport,
  selectedTransportCarrier: propSelectedTransportCarrier,
  setSelectedTransportCarrier: propSetSelectedTransportCarrier,
  transportDistance: propTransportDistance,
  setTransportDistance: propSetTransportDistance,
  carriers: propCarriers = [],
  selectedExcavator: propSelectedExcavator,
  selectedCarrier: propSelectedCarrier,
  selectedCompactor: propSelectedCompactor,
  recalculateTrigger = 0
}) => {
  const { t } = useTranslation(['calculator', 'utilities', 'common', 'units']);
  const companyId = useAuthStore(state => state.getCompanyId());
  const initArea = (savedInputs?.effectiveAreaM2 != null && savedInputs.effectiveAreaM2 > 0)
    ? String(savedInputs.effectiveAreaM2.toFixed(3))
    : (savedInputs?.area != null ? String(savedInputs.area) : (initialArea != null ? initialArea.toFixed(3) : ''));
  const [area, setArea] = useState<string>(initArea);
  const [tape1ThicknessCm, setTape1ThicknessCm] = useState<string>(savedInputs?.tape1ThicknessCm ?? '');
  const [soilThicknessCm, setSoilThicknessCm] = useState<string>(savedInputs?.soilThicknessCm ?? '');
  const [soilExcessCm, setSoilExcessCm] = useState<string>(savedInputs?.soilExcessCm ?? '');
  const [grassRollThicknessCm, setGrassRollThicknessCm] = useState<string>(savedInputs?.grassRollThicknessCm ?? '2');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [totalHours, setTotalHours] = useState<number | null>(null);
  const [calculationError, setCalculationError] = useState<string | null>(null);
  const [taskBreakdown, setTaskBreakdown] = useState<{ task: string; hours: number; amount: string; unit: string }[]>([]);
  const [calculateDigging, setCalculateDigging] = useState<boolean>(false);
  const [selectedExcavator, setSelectedExcavator] = useState<DiggingEquipment | null>(null);
  const [selectedCarrier, setSelectedCarrier] = useState<DiggingEquipment | null>(null);
  const [excavators, setExcavators] = useState<DiggingEquipment[]>([]);
  const [carriersLocal, setCarriersLocal] = useState<DiggingEquipment[]>([]);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [soilTransportDistance, setSoilTransportDistance] = useState<string>('30');
  const [tape1TransportDistance, setTape1TransportDistance] = useState<string>('30');
  const [materialTransportDistance, setMaterialTransportDistance] = useState<string>('30');
  const [calculateTransport, setCalculateTransport] = useState<boolean>(false);
  const [selectedTransportCarrier, setSelectedTransportCarrier] = useState<DiggingEquipment | null>(null);
  const [transportDistance, setTransportDistance] = useState<string>('30');
  const [selectedCompactor, setSelectedCompactor] = useState<CompactorOption | null>(null);

  const effectiveCompactor = isInProjectCreating && propSelectedCompactor ? propSelectedCompactor : selectedCompactor;
  const effectiveCalculateTransport = isInProjectCreating ? (propCalculateTransport ?? false) : calculateTransport;
  const effectiveSelectedTransportCarrier = isInProjectCreating ? (propSelectedTransportCarrier ?? null) : selectedTransportCarrier;
  const effectiveTransportDistance = isInProjectCreating && propTransportDistance ? propTransportDistance : (propTransportDistance ?? materialTransportDistance);
  const carriers = propCarriers && propCarriers.length > 0 ? propCarriers : carriersLocal;

  useEffect(() => {
    if (savedInputs?.effectiveAreaM2 != null && savedInputs.effectiveAreaM2 > 0) setArea(String(savedInputs.effectiveAreaM2.toFixed(3)));
    else if (savedInputs?.area != null) setArea(String(savedInputs.area));
    else if (initialArea != null && isInProjectCreating) setArea(initialArea.toFixed(3));
  }, [savedInputs?.effectiveAreaM2, savedInputs?.area, initialArea, isInProjectCreating]);

  useEffect(() => {
    if (savedInputs?.tape1ThicknessCm != null && savedInputs.tape1ThicknessCm !== '') setTape1ThicknessCm(String(savedInputs.tape1ThicknessCm));
    if (savedInputs?.soilThicknessCm != null && savedInputs.soilThicknessCm !== '') setSoilThicknessCm(String(savedInputs.soilThicknessCm));
  }, [savedInputs?.tape1ThicknessCm, savedInputs?.soilThicknessCm]);

  useEffect(() => {
    if (onInputsChange && isInProjectCreating) {
      onInputsChange({
        area,
        tape1ThicknessCm,
        soilThicknessCm,
        soilExcessCm,
        grassRollThicknessCm,
      });
    }
  }, [area, tape1ThicknessCm, soilThicknessCm, soilExcessCm, grassRollThicknessCm, onInputsChange, isInProjectCreating]);

  // Fetch laying task: "laying natural turf" (primary) or "laying turf" (fallback)
  const { data: layingTask, isLoading } = useQuery({
    queryKey: ['natural_turf_laying_task', companyId || 'no-company'],
    queryFn: async () => {
      if (!companyId) return null;
      const { data: naturalData } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId)
        .eq('name', 'laying natural turf')
        .maybeSingle();
      if (naturalData) return naturalData;
      const { data: turfData } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId)
        .eq('name', 'laying turf')
        .maybeSingle();
      return turfData;
    },
    enabled: !!companyId
  });

  // Fetch final leveling (sand) — displayed as "final leveling (soil)" for natural turf
  const { data: finalLevelingSandTask } = useQuery({
    queryKey: ['final_leveling_sand_task', companyId || 'no-company'],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId)
        .eq('name', 'final leveling (sand)')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId
  });

  const { data: taskTemplates = [] } = useQuery({
    queryKey: ['task_templates', companyId || 'no-company'],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId
  });

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
    return trips * timePerTrip;
  };

  useEffect(() => {
    if (isInProjectCreating && propTransportDistance) {
      setMaterialTransportDistance(propTransportDistance);
    }
  }, [isInProjectCreating, propTransportDistance]);

  useEffect(() => {
    const fetchEquipment = async () => {
      try {
        const cid = useAuthStore.getState().getCompanyId();
        if (!cid) return;
        const { data: excavatorData, error: excavatorError } = await supabase
          .from('setup_digging')
          .select('*')
          .eq('type', 'excavator')
          .eq('company_id', cid);
        if (excavatorError) throw excavatorError;
        const { data: carrierData, error: carrierError } = await supabase
          .from('setup_digging')
          .select('*')
          .eq('type', 'barrows_dumpers')
          .eq('company_id', cid);
        if (carrierError) throw carrierError;
        setExcavators(excavatorData || []);
        setCarriersLocal(carrierData || []);
      } catch (error) {
        console.error('Error fetching equipment:', error);
      }
    };
    if (calculateDigging || calculateTransport) fetchEquipment();
  }, [calculateDigging, calculateTransport]);

  const calculate = async () => {
    const areaForCalc = (savedInputs?.effectiveAreaM2 != null && savedInputs.effectiveAreaM2 > 0)
      ? savedInputs.effectiveAreaM2
      : parseFloat(area);
    if ((!area || isNaN(parseFloat(area))) && (!savedInputs?.effectiveAreaM2 || savedInputs.effectiveAreaM2 <= 0)) {
      setCalculationError(t('calculator:fill_all_required_fields'));
      return;
    }
    if (!tape1ThicknessCm || !soilThicknessCm || !grassRollThicknessCm) {
      setCalculationError(t('calculator:fill_all_required_fields'));
      return;
    }

    setCalculationError(null);

    try {
      const areaNum = areaForCalc;
      const tape1ThicknessM = parseFloat(tape1ThicknessCm) / 100;
      const soilThicknessM = parseFloat(soilThicknessCm) / 100;
      const grassRollThicknessM = parseFloat(grassRollThicknessCm) / 100;
      const soilExcessM = soilExcessCm ? parseFloat(soilExcessCm) / 100 : 0;

      const totalExcavationDepthM = grassRollThicknessM + soilThicknessM + tape1ThicknessM;
      const excavatedVolume = areaNum * totalExcavationDepthM;
      const excavatedSoilTonnes = excavatedVolume * 1.8;

      const soilVolume = areaNum * soilThicknessM;
      const soilTonnes = soilVolume * 1.8;

      const tape1Volume = areaNum * tape1ThicknessM;
      const tape1Tonnes = tape1Volume * 2.1;

      const turfRolls = Math.ceil(areaNum * 1.05);

      let mainTaskHours = 0;
      if (layingTask?.estimated_hours != null) {
        mainTaskHours = areaNum * layingTask.estimated_hours;
      }

      const breakdown: { task: string; hours: number; amount: string; unit: string }[] = [
        { task: 'Laying Natural Turf', hours: mainTaskHours, amount: areaNum.toString(), unit: 'square meters' }
      ];

      // Final leveling: fetch "final leveling (sand)" template, display as "final leveling (soil)"
      if (finalLevelingSandTask?.estimated_hours != null) {
        breakdown.push({
          task: 'final leveling (soil)',
          hours: areaNum * finalLevelingSandTask.estimated_hours,
          amount: areaNum.toString(),
          unit: 'square meters'
        });
      }

      // Compacting tape1 — when compactor selected and tape1 has value
      if (effectiveCompactor && tape1Tonnes > 0) {
        const tape1DepthCm = parseFloat(tape1ThicknessCm || '0');
        if (tape1DepthCm > 0) {
          const compactingCalc = calculateCompactingTime(effectiveCompactor, tape1DepthCm, 'type1');
          const compactingTimeTotal = areaNum * compactingCalc.timePerM2 * compactingCalc.totalPasses;
          if (compactingTimeTotal > 0 && compactingCalc.compactorTaskName) {
            breakdown.push({
              task: compactingCalc.compactorTaskName,
              hours: compactingTimeTotal,
              amount: tape1Tonnes.toFixed(2),
              unit: 'tonnes'
            });
          }
        }
      }

      const activeExcavator = isInProjectCreating && propSelectedExcavator ? propSelectedExcavator : selectedExcavator;
      const shouldAddDigging = activeExcavator && (calculateDigging || isInProjectCreating);

      if (shouldAddDigging) {
        const excavatorSize = activeExcavator["size (in tones)"] || 0;
        const excavatorName = activeExcavator.name || '';

        const soilExcavationTemplate = taskTemplates.find((t: any) => {
          const name = (t.name || '').toLowerCase();
          return name.includes('excavation soil') && name.includes(excavatorName.toLowerCase()) && name.includes(`(${excavatorSize}t)`);
        });
        const soilExcavationTime = soilExcavationTemplate?.estimated_hours ? soilExcavationTemplate.estimated_hours * excavatedSoilTonnes : 0;

        let tape1LoadingTime = 0;
        if (tape1Tonnes > 0) {
          const tape1Template = taskTemplates.find((t: any) => {
            const name = (t.name || '').toLowerCase();
            return name.includes('loading tape1') && name.includes(excavatorName.toLowerCase()) && name.includes(`(${excavatorSize}t)`);
          });
          tape1LoadingTime = tape1Template?.estimated_hours ? tape1Template.estimated_hours * tape1Tonnes : 0;
        }

        const loadingSoilTime = findLoadingSoilTimeEstimate(excavatorSize) * soilTonnes;

        breakdown.unshift({ task: 'Soil Excavation', hours: soilExcavationTime, amount: excavatedSoilTonnes.toFixed(2), unit: 'tonnes' });
        if (tape1LoadingTime > 0) {
          breakdown.unshift({ task: 'Loading tape1', hours: tape1LoadingTime, amount: tape1Tonnes.toFixed(2), unit: 'tonnes' });
        }
        if (loadingSoilTime > 0) {
          breakdown.unshift({ task: 'Loading soil', hours: loadingSoilTime, amount: soilTonnes.toFixed(2), unit: 'tonnes' });
        }

        const activeCarrier = isInProjectCreating ? propSelectedCarrier : selectedCarrier;
        if (activeCarrier?.speed_m_per_hour) {
          const soilDist = parseFloat(soilTransportDistance) || 0;
          const tape1Dist = parseFloat(tape1TransportDistance) || 0;
          const carrierSizeT = activeCarrier["size (in tones)"] || 0;
          if (soilDist > 0 && excavatedSoilTonnes > 0) {
            const soilCap = getMaterialCapacity('soil', carrierSizeT);
            const soilTrips = Math.ceil(excavatedSoilTonnes / soilCap);
            const soilTransportTime = (soilTrips * soilDist * 2) / activeCarrier.speed_m_per_hour;
            breakdown.unshift({ task: `Transporting soil (${soilDist}m)`, hours: soilTransportTime, amount: excavatedSoilTonnes.toFixed(2), unit: 'tonnes' });
          }
          if (tape1Dist > 0 && tape1Tonnes > 0) {
            const tape1Cap = getMaterialCapacity('tape1', carrierSizeT);
            const tape1Trips = Math.ceil(tape1Tonnes / tape1Cap);
            const tape1TransportTime = (tape1Trips * tape1Dist * 2) / activeCarrier.speed_m_per_hour;
            breakdown.unshift({ task: `Transporting tape1 (${tape1Dist}m)`, hours: tape1TransportTime, amount: tape1Tonnes.toFixed(2), unit: 'tonnes' });
          }
        }
      }

      const transportDistanceMeters = parseFloat(effectiveTransportDistance || materialTransportDistance) || 30;

      if (effectiveCalculateTransport) {
        const carrierSizeT = effectiveSelectedTransportCarrier?.['size (in tones)'] ?? 0.125;

        if (turfRolls > 0) {
          const turfTransportTime = calculateMaterialTransportTime(turfRolls, carrierSizeT, 'turfRolls', transportDistanceMeters);
          breakdown.push({ task: 'transport turf rolls', hours: turfTransportTime, amount: turfRolls.toString(), unit: 'rolls' });
        }
        if (excavatedSoilTonnes > 0) {
          const soilTransportTime = calculateMaterialTransportTime(excavatedSoilTonnes, carrierSizeT, 'soil', transportDistanceMeters);
          breakdown.push({ task: 'transport soil', hours: soilTransportTime, amount: excavatedSoilTonnes.toFixed(2), unit: 'tonnes' });
        }
        if (tape1Tonnes > 0) {
          const tape1TransportTime = calculateMaterialTransportTime(tape1Tonnes, carrierSizeT, 'tape1', transportDistanceMeters);
          breakdown.push({ task: 'transport tape1', hours: tape1TransportTime, amount: tape1Tonnes.toFixed(2), unit: 'tonnes' });
        }
      }

      const totalH = breakdown.reduce((sum, item) => sum + item.hours, 0);

      const materialsList: Material[] = [
        { name: 'Natural turf rolls', amount: turfRolls, unit: 'rolls', price_per_unit: null, total_price: null },
        { name: 'Lawn soil', amount: Number(soilTonnes.toFixed(2)), unit: 'tonnes', price_per_unit: null, total_price: null },
        { name: 'tape1', amount: Number(tape1Tonnes.toFixed(2)), unit: 'tonnes', price_per_unit: null, total_price: null }
      ];

      setMaterials(materialsList);
      setTotalHours(totalH);
      setTaskBreakdown(breakdown);

      if (onResultsChange) {
        onResultsChange({
          name: 'Natural Turf',
          amount: areaNum,
          unit: 'm²',
          hours_worked: totalH,
          materials: materialsList.map(m => ({ name: m.name, quantity: m.amount, unit: m.unit })),
          taskBreakdown: breakdown.map(t => ({ task: t.task, hours: t.hours, amount: t.amount, unit: t.unit }))
        });
      }
    } catch (error) {
      console.error('Calculation error:', error);
      setCalculationError(t('calculator:calculation_error'));
    }
  };

  // Recalculate when project settings (transport, equipment) change
  useEffect(() => {
    if (recalculateTrigger > 0 && isInProjectCreating) {
      void calculate();
    }
  }, [recalculateTrigger]);

  useEffect(() => {
    if (totalHours !== null && materials.length > 0 && onResultsChange) {
      onResultsChange({
        name: 'Natural Turf',
        amount: parseFloat(area) || 0,
        hours_worked: totalHours,
        materials: materials.map(m => ({ name: m.name, quantity: m.amount, unit: m.unit })),
        taskBreakdown: taskBreakdown.map(t => ({ task: t.task, hours: t.hours, amount: t.amount, unit: t.unit }))
      });
    }
  }, [totalHours, materials, taskBreakdown, area, onResultsChange]);

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
        <Spinner size={32} />
      </div>
    );
  }

  return (
    <div style={{ fontFamily: fonts.body, display: 'flex', flexDirection: 'column', gap: spacing["6xl"] }}>
      <h2 style={{ fontSize: fontSizes["2xl"], fontWeight: fontWeights.extrabold, color: colors.textPrimary, fontFamily: fonts.display, letterSpacing: '0.3px', margin: `${spacing.md}px 0 ${spacing.sm}px` }}>
        {t('calculator:natural_turf_calculator_title')}
      </h2>
      <p style={{ fontSize: fontSizes.base, color: colors.textDim, fontFamily: fonts.body, lineHeight: 1.5 }}>
        {t('calculator:natural_turf_calculator_description')}
      </p>

      <Card padding={`${spacing["6xl"]}px ${spacing["6xl"]}px ${spacing.md}px`} style={{ marginBottom: spacing["5xl"] }}>
        <TextInput
          label={t('calculator:input_area_m2')}
          value={area}
          onChange={setArea}
          placeholder={t('calculator:placeholder_enter_area_m2')}
          unit="m²"
        />
        <CalculatorInputGrid columns={2}>
          <TextInput
            label={t('calculator:input_type1_thickness_cm')}
            value={tape1ThicknessCm}
            onChange={setTape1ThicknessCm}
            placeholder={t('calculator:placeholder_enter_thickness')}
            unit="cm"
          />
          <TextInput
            label={t('calculator:input_soil_thickness_cm')}
            value={soilThicknessCm}
            onChange={setSoilThicknessCm}
            placeholder={t('calculator:placeholder_enter_thickness')}
            unit="cm"
          />
        </CalculatorInputGrid>
        <TextInput
          label={t('calculator:input_additional_soil_depth_cm')}
          value={soilExcessCm}
          onChange={setSoilExcessCm}
          placeholder={t('calculator:placeholder_enter_depth_cm')}
          unit="cm"
          helperText={t('calculator:additional_soil_depth_desc')}
        />
        <TextInput
          label={t('calculator:input_grass_roll_thickness_cm')}
          value={grassRollThicknessCm}
          onChange={setGrassRollThicknessCm}
          placeholder="2"
          unit="cm"
          helperText={t('calculator:grass_roll_thickness_desc')}
        />

        {/* Compactor — only when tape1 has value (for compacting tape1) */}
        {parseFloat(tape1ThicknessCm || '0') > 0 && !isInProjectCreating && (
          <CompactorSelector
            selectedCompactor={selectedCompactor}
            onCompactorChange={setSelectedCompactor}
          />
        )}

        {!isInProjectCreating && (
          <Checkbox label={t('calculator:calculate_digging_prep')} checked={calculateDigging} onChange={setCalculateDigging} />
        )}

        {calculateDigging && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: `0 ${spacing["5xl"]}px` }}>
            <div>
              <label style={{ display: 'block', fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted, marginBottom: spacing.lg }}>{t('calculator:excavation_machinery')}</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                {excavators.length === 0 ? (
                  <p style={{ color: colors.textDim }}>{t('calculator:no_excavators_found')}</p>
                ) : (
                  excavators.map((exc) => (
                    <div
                      key={exc.id}
                      style={{ display: 'flex', alignItems: 'center', padding: `${spacing.lg}px ${spacing["2xl"]}px`, cursor: 'pointer', borderRadius: radii.lg, background: selectedExcavator?.id === exc.id ? colors.bgHover : 'transparent', border: `1px solid ${selectedExcavator?.id === exc.id ? colors.accentBlueBorder : colors.borderLight}` }}
                      onClick={() => setSelectedExcavator(exc)}
                    >
                      <div style={{ width: 16, height: 16, borderRadius: radii.full, border: `2px solid ${selectedExcavator?.id === exc.id ? colors.accentBlue : colors.borderMedium}`, marginRight: spacing.md, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {selectedExcavator?.id === exc.id && <div style={{ width: 8, height: 8, borderRadius: radii.full, background: colors.accentBlue }} />}
                      </div>
                      <span style={{ fontSize: fontSizes.base, color: colors.textSecondary }}>{exc.name}</span>
                      <span style={{ fontSize: fontSizes.sm, color: colors.textDim, marginLeft: spacing.md }}>({exc["size (in tones)"]} tons)</span>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted, marginBottom: spacing.lg }}>{t('calculator:carrier_machinery')}</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                {carriers.length === 0 ? (
                  <p style={{ color: colors.textDim }}>{t('calculator:no_carriers_found')}</p>
                ) : (
                  carriers.map((car) => (
                    <div
                      key={car.id}
                      style={{ display: 'flex', alignItems: 'center', padding: `${spacing.lg}px ${spacing["2xl"]}px`, cursor: 'pointer', borderRadius: radii.lg, background: selectedCarrier?.id === car.id ? colors.bgHover : 'transparent', border: `1px solid ${selectedCarrier?.id === car.id ? colors.accentBlueBorder : colors.borderLight}` }}
                      onClick={() => setSelectedCarrier(car)}
                    >
                      <div style={{ width: 16, height: 16, borderRadius: radii.full, border: `2px solid ${selectedCarrier?.id === car.id ? colors.accentBlue : colors.borderMedium}`, marginRight: spacing.md, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {selectedCarrier?.id === car.id && <div style={{ width: 8, height: 8, borderRadius: radii.full, background: colors.accentBlue }} />}
                      </div>
                      <span style={{ fontSize: fontSizes.base, color: colors.textSecondary }}>{car.name}</span>
                      <span style={{ fontSize: fontSizes.sm, color: colors.textDim, marginLeft: spacing.md }}>({car["size (in tones)"]} tons)</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {!isInProjectCreating && calculateDigging && selectedCarrier && (
          <TextInput
            label={t('calculator:transport_distance_label')}
            value={soilTransportDistance}
            onChange={(v) => { setSoilTransportDistance(v); setTape1TransportDistance(v); }}
            placeholder={t('calculator:placeholder_enter_transport_distance')}
            unit="m"
            helperText={t('calculator:set_to_zero_no_transporting')}
          />
        )}

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
                {carriers.map((car) => (
                  <div
                    key={car.id}
                    style={{ display: 'flex', alignItems: 'center', padding: `${spacing.lg}px ${spacing["2xl"]}px`, cursor: 'pointer', borderRadius: radii.lg, background: selectedTransportCarrier?.id === car.id ? colors.bgHover : 'transparent', border: `1px solid ${selectedTransportCarrier?.id === car.id ? colors.accentBlueBorder : colors.borderLight}` }}
                    onClick={() => setSelectedTransportCarrier(car)}
                  >
                    <div style={{ width: 16, height: 16, borderRadius: radii.full, border: `2px solid ${selectedTransportCarrier?.id === car.id ? colors.accentBlue : colors.borderMedium}`, marginRight: spacing.md, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {selectedTransportCarrier?.id === car.id && <div style={{ width: 8, height: 8, borderRadius: radii.full, background: colors.accentBlue }} />}
                    </div>
                    <span style={{ fontSize: fontSizes.base, color: colors.textSecondary }}>{car.name}</span>
                    <span style={{ fontSize: fontSizes.sm, color: colors.textDim, marginLeft: spacing.md }}>({car["size (in tones)"]} tons)</span>
                  </div>
                ))}
              </div>
            </div>
            <TextInput
              label={t('calculator:transport_distance_label')}
              value={materialTransportDistance}
              onChange={setMaterialTransportDistance}
              placeholder={t('calculator:placeholder_enter_material_transport')}
              unit="m"
              helperText={t('calculator:distance_transporting_materials')}
            />
          </>
        )}

        <Button variant="primary" fullWidth onClick={calculate} disabled={isLoading}>
          {isLoading ? t('calculator:loading_in_progress') : t('calculator:calculate_button')}
        </Button>

        {calculationError && (
          <div className="p-3 rounded-lg" style={{ background: `${colors.red}15`, border: `1px solid ${colors.red}40`, color: colors.textPrimary }}>
            {calculationError}
          </div>
        )}

        {(totalHours !== null || materials.length > 0) && (
          <div style={{ marginTop: spacing["6xl"], display: 'flex', flexDirection: 'column', gap: spacing["5xl"] }} ref={resultsRef}>
            {totalHours !== null && (
              <>
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
              </>
            )}
            {materials.length > 0 && (
              <DataTable
                columns={[
                  { key: 'name', label: t('calculator:table_material_header'), width: '2fr' },
                  { key: 'quantity', label: t('calculator:table_quantity_header'), width: '1fr' },
                  { key: 'unit', label: t('calculator:table_unit_header'), width: '1fr' },
                ]}
                rows={materials.map((m) => ({
                  name: <span style={{ fontSize: fontSizes.base, color: colors.textMuted, fontFamily: fonts.body }}>{translateMaterialName(m.name, t)}</span>,
                  quantity: <span style={{ fontSize: fontSizes.base, color: colors.textSubtle }}>{m.unit === 'rolls' ? m.amount : m.amount.toFixed(2)}</span>,
                  unit: <span style={{ fontSize: fontSizes.sm, color: colors.textDim }}>{translateUnit(m.unit, t)}</span>,
                }))}
              />
            )}
          </div>
        )}
      </Card>
    </div>
  );
};

export default NaturalTurfCalculator;
