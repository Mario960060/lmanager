import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { carrierSpeeds, getMaterialCapacity } from '../../constants/materialCapacity';
import { translateTaskName, translateUnit, translateMaterialName } from '../../lib/translationMap';
import { CompactorSelector, type CompactorOption } from './CompactorSelector';
import { calculateCompactingTime } from '../../lib/compactingCalculations';
import { colors } from '../../themes/designTokens';
import { Spinner, Button } from '../../themes/uiComponents';

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
    const carrierSpeed = carrierSpeedData?.speed || 4000;
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

      if (effectiveCalculateTransport && effectiveSelectedTransportCarrier) {
        const carrierSizeT = effectiveSelectedTransportCarrier["size (in tones)"] || 0.125;

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
        { name: 'Soil', amount: Number(soilTonnes.toFixed(2)), unit: 'tonnes', price_per_unit: null, total_price: null },
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
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">{t('calculator:natural_turf_calculator_title')}</h2>
      <p className="text-sm text-gray-600">
        {t('calculator:natural_turf_calculator_description')}
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">{t('calculator:input_area_m2')}</label>
          <input
            type="number"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 form-input"
            placeholder={t('calculator:placeholder_enter_area_m2')}
            min="0"
            step="0.01"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">{t('calculator:input_type1_thickness_cm')}</label>
          <input
            type="number"
            value={tape1ThicknessCm}
            onChange={(e) => setTape1ThicknessCm(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 form-input"
            placeholder={t('calculator:placeholder_enter_thickness')}
            min="0"
            step="0.5"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">{t('calculator:input_soil_thickness_cm')}</label>
          <input
            type="number"
            value={soilThicknessCm}
            onChange={(e) => setSoilThicknessCm(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 form-input"
            placeholder={t('calculator:placeholder_enter_thickness')}
            min="0"
            step="0.5"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">{t('calculator:input_additional_soil_depth_cm')}</label>
          <input
            type="number"
            value={soilExcessCm}
            onChange={(e) => setSoilExcessCm(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 form-input"
            placeholder={t('calculator:placeholder_enter_depth_cm')}
            min="0"
            step="0.5"
          />
          <p className="text-xs text-gray-500 mt-1">{t('calculator:additional_soil_depth_desc')}</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">{t('calculator:input_grass_roll_thickness_cm')}</label>
          <input
            type="number"
            value={grassRollThicknessCm}
            onChange={(e) => setGrassRollThicknessCm(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 form-input"
            placeholder="2"
            min="0"
            step="0.5"
          />
          <p className="text-xs text-gray-500 mt-1">{t('calculator:grass_roll_thickness_desc')}</p>
        </div>

        {/* Compactor — only when tape1 has value (for compacting tape1) */}
        {parseFloat(tape1ThicknessCm || '0') > 0 && !isInProjectCreating && (
          <CompactorSelector
            selectedCompactor={selectedCompactor}
            onCompactorChange={setSelectedCompactor}
          />
        )}

        {!isInProjectCreating && (
          <div className="mt-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={calculateDigging}
                onChange={(e) => setCalculateDigging(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">{t('calculator:calculate_digging_prep')}</span>
            </label>
          </div>
        )}

        {calculateDigging && (
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">{t('calculator:excavation_machinery')}</label>
              <div className="space-y-2">
                {excavators.length === 0 ? (
                  <p className="text-gray-500">{t('calculator:no_excavators_found')}</p>
                ) : (
                  excavators.map((exc) => (
                    <div key={exc.id} className="flex items-center p-2 cursor-pointer" onClick={() => setSelectedExcavator(exc)}>
                      <div className={`w-4 h-4 rounded-full border mr-2 ${selectedExcavator?.id === exc.id ? 'border-gray-400' : 'border-gray-400'}`}>
                        <div className={`w-2 h-2 rounded-full m-0.5 ${selectedExcavator?.id === exc.id ? 'bg-gray-400' : 'bg-transparent'}`}></div>
                      </div>
                      <span className="text-gray-800">{exc.name}</span>
                      <span className="text-sm text-gray-600 ml-2">({exc["size (in tones)"]} tons)</span>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">{t('calculator:carrier_machinery')}</label>
              <div className="space-y-2">
                {carriers.length === 0 ? (
                  <p className="text-gray-500">{t('calculator:no_carriers_found')}</p>
                ) : (
                  carriers.map((car) => (
                    <div key={car.id} className="flex items-center p-2 cursor-pointer" onClick={() => setSelectedCarrier(car)}>
                      <div className={`w-4 h-4 rounded-full border mr-2 ${selectedCarrier?.id === car.id ? 'border-gray-400' : 'border-gray-400'}`}>
                        <div className={`w-2 h-2 rounded-full m-0.5 ${selectedCarrier?.id === car.id ? 'bg-gray-400' : 'bg-transparent'}`}></div>
                      </div>
                      <span className="text-gray-800">{car.name}</span>
                      <span className="text-sm text-gray-600 ml-2">({car["size (in tones)"]} tons)</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {!isInProjectCreating && calculateDigging && selectedCarrier && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('calculator:transport_distance_label')}</label>
            <input
              type="number"
              value={soilTransportDistance}
              onChange={(e) => {
                setSoilTransportDistance(e.target.value);
                setTape1TransportDistance(e.target.value);
              }}
              className="w-full p-2 border rounded-md"
              placeholder={t('calculator:placeholder_enter_transport_distance')}
              min="0"
              step="1"
            />
            <p className="text-xs text-gray-500 mt-1">{t('calculator:set_to_zero_no_transporting')}</p>
          </div>
        )}

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

        {!isInProjectCreating && calculateTransport && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">{t('calculator:transport_carrier_label')}</label>
              <div className="space-y-2">
                <div className="flex items-center p-2 cursor-pointer border-2 border-dashed border-gray-300 rounded" onClick={() => setSelectedTransportCarrier(null)}>
                  <div className={`w-4 h-4 rounded-full border mr-2 ${selectedTransportCarrier === null ? 'border-gray-400' : 'border-gray-400'}`}>
                    <div className={`w-2 h-2 rounded-full m-0.5 ${selectedTransportCarrier === null ? 'bg-gray-400' : 'bg-transparent'}`}></div>
                  </div>
                  <span className="text-gray-800">{t('calculator:default_wheelbarrow')}</span>
                </div>
                {carriers.map((car) => (
                  <div key={car.id} className="flex items-center p-2 cursor-pointer" onClick={() => setSelectedTransportCarrier(car)}>
                    <div className={`w-4 h-4 rounded-full border mr-2 ${selectedTransportCarrier?.id === car.id ? 'border-gray-400' : 'border-gray-400'}`}>
                      <div className={`w-2 h-2 rounded-full m-0.5 ${selectedTransportCarrier?.id === car.id ? 'bg-gray-400' : 'bg-transparent'}`}></div>
                    </div>
                    <span className="text-gray-800">{car.name}</span>
                    <span className="text-sm text-gray-600 ml-2">({car["size (in tones)"]} tons)</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('calculator:transport_distance_label')}</label>
              <input
                type="number"
                value={materialTransportDistance}
                onChange={(e) => setMaterialTransportDistance(e.target.value)}
                className="w-full p-2 border rounded-md"
                placeholder={t('calculator:placeholder_enter_material_transport')}
                min="0"
                step="1"
              />
              <p className="text-xs text-gray-500 mt-1">{t('calculator:distance_transporting_materials')}</p>
            </div>
          </>
        )}

        <Button variant="accent" color={colors.accentBlue} onClick={calculate} disabled={isLoading}>
          {isLoading ? t('calculator:loading_in_progress') : t('calculator:calculate_button')}
        </Button>

        {calculationError && (
          <div className="p-3 bg-red-900/90 border border-red-600 rounded-lg text-white">
            {calculationError}
          </div>
        )}

        {(totalHours !== null || materials.length > 0) && (
          <div className="mt-6 space-y-4" ref={resultsRef}>
            <div>
              <h3 className="text-lg font-medium">{t('calculator:total_labor_hours_label')} <span className="text-blue-600">{totalHours?.toFixed(2)} {t('calculator:hours_abbreviation')}</span></h3>
              <div className="mt-2">
                <h4 className="font-medium text-gray-700 mb-2">{t('calculator:task_breakdown_label')}</h4>
                <ul className="space-y-1 pl-5 list-disc">
                  {taskBreakdown.map((task, index) => (
                    <li key={index} className="text-sm">
                      <span className="font-medium">{translateTaskName(task.task, t)}:</span> {task.hours.toFixed(2)} {t('calculator:hours_label')}
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
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('calculator:material_label')}</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('calculator:quantity_label')}</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('calculator:unit_label')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {materials.map((m, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-6 py-4 text-sm text-gray-900">{translateMaterialName(m.name, t)}</td>
                        <td className="px-6 py-4 text-sm text-gray-900">{m.unit === 'rolls' ? m.amount : m.amount.toFixed(2)}</td>
                        <td className="px-6 py-4 text-sm text-gray-900">{translateUnit(m.unit, t)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NaturalTurfCalculator;
