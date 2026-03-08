import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { carrierSpeeds, getMaterialCapacity } from '../../constants/materialCapacity';
import { translateTaskName, translateUnit } from '../../lib/translationMap';
import { CompactorSelector, type CompactorOption } from './CompactorSelector';
import { calculateCompactingTime } from '../../lib/compactingCalculations';
import { computeSlabCuts, computePathSlabCuts, groupCutsByLength } from '../../projectmanagement/canvacreator/visualization/slabPattern';

export type SlabSizeKey = '40x40' | '60x60' | '90x60';

const SLAB_SIZES: { key: SlabSizeKey; label: string; widthCm: number; lengthCm: number; layingTaskName: string; cuttingDimensionCm: string }[] = [
  { key: '40x40', label: '40×40', widthCm: 40, lengthCm: 40, layingTaskName: 'laying slabs 40x40 (concrete)', cuttingDimensionCm: '40cm' },
  { key: '60x60', label: '60×60', widthCm: 60, lengthCm: 60, layingTaskName: 'laying slabs 60x60 (concrete)', cuttingDimensionCm: '60cm' },
  { key: '90x60', label: '90×60', widthCm: 90, lengthCm: 60, layingTaskName: 'laying slabs 90x60 (concrete)', cuttingDimensionCm: '90cm' },
];

interface Material {
  name: string;
  amount: number;
  unit: string;
  price_per_unit: number | null;
  total_price: number | null;
}

interface MaterialUsageConfig {
  calculator_id: string;
  material_id: string;
}

interface Shape {
  points: { x: number; y: number }[];
  closed: boolean;
  calculatorInputs?: Record<string, any>;
}

interface ConcreteSlabsCalculatorProps {
  onResultsChange?: (results: any) => void;
  onInputsChange?: (inputs: Record<string, any>) => void;
  isInProjectCreating?: boolean;
  initialArea?: number;
  savedInputs?: Record<string, any>;
  shape?: Shape;
  fillTonnes?: number;
  levelingMaterial?: 'tape1' | 'soil';
  calculateTransport?: boolean;
  setCalculateTransport?: (value: boolean) => void;
  selectedTransportCarrier?: any;
  setSelectedTransportCarrier?: (value: any) => void;
  transportDistance?: string;
  setTransportDistance?: (value: string) => void;
  carriers?: any[];
  selectedExcavator?: any;
  selectedCompactor?: any;
  recalculateTrigger?: number;
  compactForPath?: boolean;
}

interface DiggingEquipment {
  id: string;
  name: string;
  type: string;
  "size (in tones)": number;
}

const ConcreteSlabsCalculator: React.FC<ConcreteSlabsCalculatorProps> = ({
  onResultsChange,
  onInputsChange,
  isInProjectCreating = false,
  initialArea,
  savedInputs = {},
  shape = undefined,
  fillTonnes = 0,
  levelingMaterial = 'tape1',
  calculateTransport: propCalculateTransport,
  setCalculateTransport: propSetCalculateTransport,
  selectedTransportCarrier: propSelectedTransportCarrier,
  setSelectedTransportCarrier: propSetSelectedTransportCarrier,
  transportDistance: propTransportDistance,
  setTransportDistance: propSetTransportDistance,
  carriers: propCarriers = [],
  selectedExcavator: propSelectedExcavator,
  selectedCompactor: propSelectedCompactor,
  recalculateTrigger = 0,
  compactForPath = false,
}) => {
  const { t } = useTranslation(['calculator', 'utilities', 'common', 'units']);
  const companyId = useAuthStore(state => state.getCompanyId());
  const initArea = savedInputs?.area != null ? String(savedInputs.area) : (initialArea != null ? initialArea.toFixed(3) : '');
  const [area, setArea] = useState<string>(initArea);
  useEffect(() => {
    if (savedInputs?.area != null) setArea(String(savedInputs.area));
    else if (initialArea != null && isInProjectCreating) setArea(initialArea.toFixed(3));
  }, [savedInputs?.area, initialArea, isInProjectCreating]);

  const [slabSizeKey, setSlabSizeKey] = useState<SlabSizeKey>((savedInputs?.slabSizeKey as SlabSizeKey) ?? '60x60');
  const [tape1ThicknessCm, setTape1ThicknessCm] = useState<string>(savedInputs?.tape1ThicknessCm ?? '');
  const [sandThicknessCm, setSandThicknessCm] = useState<string>(savedInputs?.sandThicknessCm ?? '');
  const [concreteSlabThicknessCm, setConcreteSlabThicknessCm] = useState<string>(savedInputs?.concreteSlabThicknessCm ?? '');
  const [cutSlabs, setCutSlabs] = useState<string>(savedInputs?.cutSlabs ?? '');
  const [soilExcessCm, setSoilExcessCm] = useState<string>(savedInputs?.soilExcessCm ?? '');

  useEffect(() => {
    if (savedInputs?.tape1ThicknessCm != null && savedInputs.tape1ThicknessCm !== '') setTape1ThicknessCm(String(savedInputs.tape1ThicknessCm));
    if (savedInputs?.sandThicknessCm != null && savedInputs.sandThicknessCm !== '') setSandThicknessCm(String(savedInputs.sandThicknessCm));
    if (savedInputs?.concreteSlabThicknessCm != null && savedInputs.concreteSlabThicknessCm !== '') setConcreteSlabThicknessCm(String(savedInputs.concreteSlabThicknessCm));
    if (savedInputs?.slabSizeKey && ['40x40', '60x60', '90x60'].includes(savedInputs.slabSizeKey)) setSlabSizeKey(savedInputs.slabSizeKey as SlabSizeKey);
  }, [savedInputs?.tape1ThicknessCm, savedInputs?.sandThicknessCm, savedInputs?.concreteSlabThicknessCm, savedInputs?.slabSizeKey]);

  const slabSizeConfig = SLAB_SIZES.find(s => s.key === slabSizeKey) ?? SLAB_SIZES[1];

  const [canvasCutSlabs, setCanvasCutSlabs] = useState<number | null>(null);
  const [canvasCutGroups, setCanvasCutGroups] = useState<{ lengthCm: number; count: number }[]>([]);

  const lastInputsSentRef = useRef<string>("");
  useEffect(() => {
    if (!onInputsChange || !isInProjectCreating) return;
    const next = {
      area, tape1ThicknessCm, sandThicknessCm, concreteSlabThicknessCm, cutSlabs, soilExcessCm, slabSizeKey,
      vizSlabWidth: slabSizeConfig.widthCm,
      vizSlabLength: slabSizeConfig.lengthCm,
      vizGroutWidthMm: 0,
    };
    const key = JSON.stringify(next);
    if (lastInputsSentRef.current === key) return;
    lastInputsSentRef.current = key;
    onInputsChange(next);
  }, [area, tape1ThicknessCm, sandThicknessCm, concreteSlabThicknessCm, cutSlabs, soilExcessCm, slabSizeKey, slabSizeConfig, onInputsChange, isInProjectCreating]);

  useEffect(() => {
    if (!isInProjectCreating || !shape?.closed || shape.points.length < 3) {
      setCanvasCutSlabs(null);
      setCanvasCutGroups([]);
      return;
    }
    const inputs = {
      ...shape.calculatorInputs,
      vizSlabWidth: slabSizeConfig.widthCm,
      vizSlabLength: slabSizeConfig.lengthCm,
      vizGroutWidthMm: 0,
    };
    const slabResult = inputs?.pathCenterline ? computePathSlabCuts(shape as any, inputs) : computeSlabCuts(shape as any, inputs);
    const { cuts, cutSlabCount, wasteSatisfiedPositions } = slabResult;
    setCanvasCutSlabs(cutSlabCount);
    setCanvasCutGroups(cuts.length > 0 ? groupCutsByLength(cuts) : []);
    setCutSlabs(String(cutSlabCount));
    if (onInputsChange) {
      const next = wasteSatisfiedPositions ?? [];
      const prev = shape.calculatorInputs?.vizWasteSatisfied ?? [];
      if (JSON.stringify(prev) !== JSON.stringify(next)) {
        onInputsChange({ vizWasteSatisfied: next });
      }
    }
  }, [isInProjectCreating, slabSizeConfig, shape?.calculatorInputs?.vizDirection, shape?.calculatorInputs?.vizStartCorner, shape?.calculatorInputs?.vizPattern, shape?.calculatorInputs?.vizOriginOffsetX, shape?.calculatorInputs?.vizOriginOffsetY, shape?.calculatorInputs?.pathCenterline, shape?.calculatorInputs?.pathIsOutline, shape?.calculatorInputs?.slabOrientation, JSON.stringify(shape?.points), shape?.closed, onInputsChange]);

  const [materials, setMaterials] = useState<Material[]>([]);
  const [totalHours, setTotalHours] = useState<number | null>(null);
  const [calculationError, setCalculationError] = useState<string | null>(null);
  const [taskBreakdown, setTaskBreakdown] = useState<{ task: string; hours: number; amount: number | string; unit: string }[]>([]);
  const [calculateDigging, setCalculateDigging] = useState<boolean>(false);
  const [selectedExcavator, setSelectedExcavator] = useState<DiggingEquipment | null>(null);
  const [selectedCarrier, setSelectedCarrier] = useState<DiggingEquipment | null>(null);
  const [excavators, setExcavators] = useState<DiggingEquipment[]>([]);
  const [carriers, setCarriers] = useState<DiggingEquipment[]>([]);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [soilTransportDistance, setSoilTransportDistance] = useState<string>('30');
  const [tape1TransportDistance, setTape1TransportDistance] = useState<string>('30');
  const [materialTransportDistance, setMaterialTransportDistance] = useState<string>('30');
  const [calculateTransport, setCalculateTransport] = useState<boolean>(false);
  const [selectedTransportCarrier, setSelectedTransportCarrier] = useState<DiggingEquipment | null>(null);
  const [selectedCompactor, setSelectedCompactor] = useState<CompactorOption | null>(null);

  const useTransportProps = isInProjectCreating && propSetCalculateTransport != null;
  const effectiveCalculateTransport = useTransportProps ? (propCalculateTransport ?? false) : calculateTransport;
  const effectiveSetCalculateTransport = useTransportProps ? propSetCalculateTransport! : setCalculateTransport;
  const effectiveSelectedTransportCarrier = useTransportProps ? (propSelectedTransportCarrier ?? null) : selectedTransportCarrier;
  const effectiveSetSelectedTransportCarrier = useTransportProps ? propSetSelectedTransportCarrier! : setSelectedTransportCarrier;
  const effectiveTransportDistance = isInProjectCreating && propTransportDistance != null && propTransportDistance !== '' ? propTransportDistance : materialTransportDistance;
  const effectiveCompactor = isInProjectCreating && propSelectedCompactor ? propSelectedCompactor : selectedCompactor;

  const { data: layingTask } = useQuery({
    queryKey: ['laying_task_concrete', slabSizeKey, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId)
        .eq('name', slabSizeConfig.layingTaskName)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: taskTemplates = [] } = useQuery({
    queryKey: ['task_templates', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: sandScreedingTask } = useQuery({
    queryKey: ['sand_screeding_task', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId)
        .eq('name', 'sand screeding')
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: compactingMonoblocksTask } = useQuery({
    queryKey: ['compacting_monoblocks_task', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId)
        .eq('name', 'compacting monoblocks m2/h')
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: finalLevelingSandTask } = useQuery({
    queryKey: ['final_leveling_sand_task', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId)
        .eq('name', 'final leveling (sand)')
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: cuttingTasksData } = useQuery({
    queryKey: ['cutting_tasks', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('*')
        .eq('company_id', companyId)
        .or('name.ilike.%cutting%,name.ilike.%cut%')
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId,
  });
  const cuttingTasks = cuttingTasksData ?? [];

  const { data: materialUsageConfig } = useQuery<MaterialUsageConfig[]>({
    queryKey: ['materialUsageConfig', 'concrete_slabs', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('material_usage_configs')
        .select('calculator_id, material_id')
        .eq('calculator_id', 'concrete_slabs')
        .eq('company_id', companyId);
      if (error) throw error;
      return data as MaterialUsageConfig[];
    },
    enabled: !!companyId,
  });

  const selectedSandMaterialId = materialUsageConfig?.[0]?.material_id;
  const { data: selectedSandMaterial } = useQuery<Material>({
    queryKey: ['material', selectedSandMaterialId, companyId],
    queryFn: async () => {
      if (!companyId || !selectedSandMaterialId) return { name: '', amount: 0, unit: '', price_per_unit: null, total_price: null } as Material;
      const { data, error } = await supabase
        .from('materials')
        .select('id, name, unit, price')
        .eq('company_id', companyId)
        .eq('id', selectedSandMaterialId)
        .single();
      if (error) throw error;
      return data as Material;
    },
    enabled: !!selectedSandMaterialId && !!companyId,
  });

  const fetchMaterialPrices = async (mats: Material[]) => {
    try {
      const materialNames = mats.map(m => m.name);
      const { data, error } = await supabase
        .from('materials')
        .select('name, price')
        .eq('company_id', companyId)
        .in('name', materialNames);
      if (error) throw error;
      const priceMap = (data || []).reduce((acc: Record<string, number>, item: any) => {
        acc[item.name] = item.price;
        return acc;
      }, {});
      return mats.map(m => ({
        ...m,
        price_per_unit: priceMap[m.name] || null,
        total_price: priceMap[m.name] ? priceMap[m.name] * m.amount : null,
      }));
    } catch (err) {
      console.error('Error fetching material prices:', err);
      return mats.map(m => ({ ...m, price_per_unit: null, total_price: null }));
    }
  };

  const loadingSandDiggerTimeEstimates = [
    { equipment: 'Shovel (1 Person)', sizeInTons: 0.02, timePerTon: 0.5 },
    { equipment: 'Digger 1T', sizeInTons: 1, timePerTon: 0.18 },
    { equipment: 'Digger 2T', sizeInTons: 2, timePerTon: 0.12 },
    { equipment: 'Digger 3-5T', sizeInTons: 3, timePerTon: 0.08 },
    { equipment: 'Digger 6-10T', sizeInTons: 6, timePerTon: 0.05 },
    { equipment: 'Digger 11-20T', sizeInTons: 11, timePerTon: 0.03 },
    { equipment: 'Digger 21-30T', sizeInTons: 21, timePerTon: 0.02 },
    { equipment: 'Digger 31-40T', sizeInTons: 31, timePerTon: 0.01 },
    { equipment: 'Digger 41-50T', sizeInTons: 41, timePerTon: 0.005 },
  ];

  const findLoadingSandTimeEstimate = (sizeInTons: number): number => {
    for (let i = 0; i < loadingSandDiggerTimeEstimates.length - 1; i++) {
      if (sizeInTons >= loadingSandDiggerTimeEstimates[i].sizeInTons && sizeInTons < loadingSandDiggerTimeEstimates[i + 1].sizeInTons) {
        return loadingSandDiggerTimeEstimates[i].timePerTon;
      }
    }
    return loadingSandDiggerTimeEstimates[loadingSandDiggerTimeEstimates.length - 1].timePerTon;
  };

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

  useEffect(() => {
    if (!calculateDigging) return;
    const fetchEquipment = async () => {
      try {
        const [excRes, carRes] = await Promise.all([
          supabase.from('setup_digging').select('*').eq('type', 'excavator').eq('company_id', companyId),
          supabase.from('setup_digging').select('*').eq('type', 'barrows_dumpers').eq('company_id', companyId),
        ]);
        setExcavators(excRes.data || []);
        setCarriers(carRes.data || []);
      } catch (e) {
        console.error('Error fetching equipment:', e);
      }
    };
    fetchEquipment();
  }, [calculateDigging, companyId]);

  const calculate = async () => {
    if (!area || !tape1ThicknessCm || !sandThicknessCm || !concreteSlabThicknessCm) {
      setCalculationError(t('calculator:fill_all_required_fields'));
      return;
    }
    setCalculationError(null);

    try {
      const areaNum = parseFloat(area);
      const tape1ThicknessM = parseFloat(tape1ThicknessCm) / 100;
      const sandThicknessM = parseFloat(sandThicknessCm) / 100;
      const concreteSlabThicknessM = parseFloat(concreteSlabThicknessCm) / 100;
      const soilExcessM = soilExcessCm ? parseFloat(soilExcessCm) / 100 : 0;
      const cutSlabsNum = isInProjectCreating && canvasCutSlabs != null ? canvasCutSlabs : (cutSlabs ? parseInt(cutSlabs) : 0);

      const totalDepthM = tape1ThicknessM + sandThicknessM + concreteSlabThicknessM + soilExcessM;
      const soilVolume = areaNum * totalDepthM;
      const soilTonnes = soilVolume * 1.5;
      const sandVolume = areaNum * sandThicknessM;
      const sandTonnes = sandVolume * 1.6;
      const tape1Volume = areaNum * tape1ThicknessM;
      const tape1Tonnes = tape1Volume * 2.1;

      const slabAreaM2 = (slabSizeConfig.widthCm / 100) * (slabSizeConfig.lengthCm / 100);
      const slabPieces = Math.ceil(areaNum / slabAreaM2);

      let mainTaskHours = 0;
      if (layingTask?.unit && layingTask?.estimated_hours !== undefined) {
        mainTaskHours = areaNum * layingTask.estimated_hours;
      }

      const cuttingTask = (cuttingTasks as any[]).find(
        (t: any) =>
          (t.name || '').toLowerCase().includes('cutting') &&
          (t.name || '').toLowerCase().includes('concrete') &&
          (t.name || '').toLowerCase().includes(slabSizeConfig.cuttingDimensionCm)
      );
      const hoursPerCut = cuttingTask?.estimated_hours ?? 2 / 60;

      let cuttingHours = 0;
      const cuttingBreakdownEntries: { task: string; hours: number; amount: number; unit: string; event_task_id?: string }[] = [];
      if (canvasCutGroups.length > 0) {
        for (const g of canvasCutGroups) {
          const h = g.count * hoursPerCut;
          cuttingHours += h;
          cuttingBreakdownEntries.push({
            task: `(${g.count}) cutting ${g.lengthCm}cm`,
            hours: h,
            amount: g.count,
            unit: 'cuts',
            event_task_id: cuttingTask?.id,
          });
        }
      } else if (cutSlabsNum > 0) {
        cuttingHours = cutSlabsNum * hoursPerCut;
        cuttingBreakdownEntries.push({
          task: `(${cutSlabsNum}) cutting concrete slabs`,
          hours: cuttingHours,
          amount: cutSlabsNum,
          unit: 'slabs',
          event_task_id: cuttingTask?.id,
        });
      }

      const transportDistanceMeters = parseFloat(effectiveTransportDistance) || 30;
      let slabTransportTime = 0;
      let sandTransportTime = 0;

      if (effectiveCalculateTransport) {
        let carrierSizeForTransport = 0.125;
        if (effectiveSelectedTransportCarrier) {
          carrierSizeForTransport = effectiveSelectedTransportCarrier["size (in tones)"] || 0.125;
        }
        if (slabPieces > 0) {
          const r = calculateMaterialTransportTime(slabPieces, carrierSizeForTransport, 'slabs', transportDistanceMeters);
          slabTransportTime = r.totalTransportTime;
        }
        if (sandTonnes > 0) {
          const r = calculateMaterialTransportTime(sandTonnes, carrierSizeForTransport, 'sand', transportDistanceMeters);
          sandTransportTime = r.totalTransportTime;
        }
      }

      let compactingTimeTotal = 0;
      let compactingCompactorName = '';
      if (effectiveCompactor && (sandThicknessCm || tape1ThicknessCm)) {
        const sandDepthCm = parseFloat(sandThicknessCm || '0');
        const tape1DepthCm = parseFloat(tape1ThicknessCm || '0');
        const totalCompactingDepthCm = sandDepthCm + tape1DepthCm;
        if (totalCompactingDepthCm > 0) {
          const compactingCalc = calculateCompactingTime(effectiveCompactor, totalCompactingDepthCm, 'sand');
          compactingTimeTotal = areaNum * compactingCalc.timePerM2 * compactingCalc.totalPasses;
          compactingCompactorName = compactingCalc.compactorTaskName;
        }
      }

      const breakdown: { task: string; hours: number; amount: number | string; unit: string; event_task_id?: string }[] = [];

      if (mainTaskHours > 0 && layingTask) {
        breakdown.push({
          task: layingTask.name,
          hours: mainTaskHours,
          amount: areaNum,
          unit: 'square meters',
          event_task_id: layingTask.id,
        });
      }

      if (effectiveCalculateTransport && slabTransportTime > 0) {
        breakdown.push({
          task: 'transport concrete slabs',
          hours: slabTransportTime,
          amount: `${slabPieces} pieces`,
          unit: 'pieces',
        });
      }
      if (effectiveCalculateTransport && sandTransportTime > 0) {
        breakdown.push({
          task: 'transport sand',
          hours: sandTransportTime,
          amount: `${sandTonnes.toFixed(2)} tonnes`,
          unit: 'tonnes',
        });
      }

      if (sandScreedingTask?.estimated_hours !== undefined) {
        breakdown.push({
          task: 'sand screeding',
          hours: areaNum * sandScreedingTask.estimated_hours,
          amount: `${areaNum} square meters`,
          unit: 'square meters',
          event_task_id: sandScreedingTask.id,
        });
      }

      if (compactingMonoblocksTask?.estimated_hours !== undefined) {
        breakdown.push({
          task: 'compacting monoblocks',
          hours: areaNum * compactingMonoblocksTask.estimated_hours,
          amount: `${areaNum} square meters`,
          unit: 'square meters',
          event_task_id: compactingMonoblocksTask.id,
        });
      }

      if (finalLevelingSandTask?.estimated_hours !== undefined) {
        breakdown.push({
          task: 'final leveling (sand)',
          hours: areaNum * finalLevelingSandTask.estimated_hours,
          amount: `${areaNum} square meters`,
          unit: 'square meters',
          event_task_id: finalLevelingSandTask.id,
        });
      }

      for (const e of cuttingBreakdownEntries) {
        breakdown.push(e);
      }

      if (compactingTimeTotal > 0 && compactingCompactorName) {
        breakdown.push({
          task: compactingCompactorName,
          hours: compactingTimeTotal,
          amount: `${areaNum} square meters`,
          unit: 'square meters',
        });
      }

      const totalH = breakdown.reduce((sum, item) => sum + item.hours, 0);

      const materialsList: Material[] = [
        { name: 'Soil excavation', amount: Number(soilTonnes.toFixed(2)), unit: 'tonnes', price_per_unit: null, total_price: null },
        { name: selectedSandMaterial?.name || 'Sand', amount: Number(sandTonnes.toFixed(2)), unit: 'tonnes', price_per_unit: selectedSandMaterial?.price || null, total_price: null },
        { name: 'tape1', amount: Number(tape1Tonnes.toFixed(2)), unit: 'tonnes', price_per_unit: null, total_price: null },
        { name: `Concrete slabs ${slabSizeConfig.label}`, amount: slabPieces, unit: 'pieces', price_per_unit: null, total_price: null },
      ];
      if (fillTonnes > 0) {
        const fillLabel = levelingMaterial === 'soil' ? 'Fill (Soil)' : 'Fill (Tape1)';
        materialsList.unshift({ name: fillLabel, amount: Number(fillTonnes.toFixed(2)), unit: 'tonnes', price_per_unit: null, total_price: null });
      }

      const materialsWithPrices = await fetchMaterialPrices(materialsList);
      setMaterials(materialsWithPrices);
      setTotalHours(totalH);
      setTaskBreakdown(breakdown);
    } catch (error) {
      console.error('Calculation error:', error);
      setCalculationError(t('calculator:calculation_error'));
    }
  };

  useEffect(() => {
    if (recalculateTrigger > 0 && isInProjectCreating) void calculate();
  }, [recalculateTrigger]);

  useEffect(() => {
    if (totalHours !== null && materials.length > 0) {
      const formattedResults = {
        name: `Concrete Slabs ${slabSizeConfig.label}`,
        amount: parseFloat(area) || 0,
        unit: 'square meters',
        hours_worked: totalHours,
        materials: materials.map(m => ({ name: m.name, quantity: m.amount, unit: m.unit })),
        taskBreakdown: taskBreakdown.map(t => ({ task: t.task, hours: t.hours, amount: t.amount, unit: t.unit })),
      };
      const el = document.querySelector('[data-calculator-results]');
      if (el) el.setAttribute('data-results', JSON.stringify(formattedResults));
      onResultsChange?.(formattedResults);
    }
  }, [totalHours, materials, taskBreakdown, area, slabSizeConfig, onResultsChange]);

  useEffect(() => {
    if (materials.length > 0 && resultsRef.current) {
      setTimeout(() => {
        const modalContainer = resultsRef.current?.closest('[data-calculator-results]');
        if (modalContainer) modalContainer.scrollTop = (resultsRef.current?.offsetTop ?? 0) - 100;
        else resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [materials]);

  return (
    <div className="space-y-4">
      {!compactForPath && (
        <div>
          <label className="block text-sm font-medium text-gray-700">{t('calculator:input_area_m2')}</label>
          <input
            type="number"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-600 focus:ring-gray-600"
            placeholder={t('calculator:placeholder_enter_area_m2')}
          />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">{t('calculator:concrete_slab_sizes') || 'Slab sizes'}</label>
        <select
          value={slabSizeKey}
          onChange={(e) => setSlabSizeKey(e.target.value as SlabSizeKey)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-600 focus:ring-gray-600"
        >
          {SLAB_SIZES.map((s) => (
            <option key={s.key} value={s.key}>{s.label} cm</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">{t('calculator:input_type1_thickness_cm')}</label>
        <input
          type="number"
          value={tape1ThicknessCm}
          onChange={(e) => setTape1ThicknessCm(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-600 focus:ring-gray-600"
          placeholder={t('calculator:placeholder_enter_thickness')}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">{t('calculator:input_sand_thickness_cm')}</label>
        <input
          type="number"
          value={sandThicknessCm}
          onChange={(e) => setSandThicknessCm(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-600 focus:ring-gray-600"
          placeholder={t('calculator:placeholder_enter_thickness')}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">{t('calculator:concrete_slab_thickness_cm') || 'Concrete slab thickness (cm)'}</label>
        <input
          type="number"
          value={concreteSlabThicknessCm}
          onChange={(e) => setConcreteSlabThicknessCm(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-600 focus:ring-gray-600"
          placeholder={t('calculator:placeholder_enter_thickness')}
        />
      </div>
      {!compactForPath && !isInProjectCreating && (
        <div>
          <label className="block text-sm font-medium text-gray-700">{t('calculator:soil_excess_label')}</label>
          <input
            type="number"
            value={soilExcessCm}
            onChange={(e) => setSoilExcessCm(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-600 focus:ring-gray-600"
            placeholder={t('calculator:enter_additional_soil_depth')}
            min="0"
            step="0.5"
          />
        </div>
      )}
      {!isInProjectCreating && !compactForPath && (
        <div>
          <label className="block text-sm font-medium text-gray-700">{t('calculator:concrete_slabs_to_cut') || 'Number of concrete slabs to cut'}</label>
          <input
            type="number"
            value={cutSlabs}
            onChange={(e) => setCutSlabs(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-600 focus:ring-gray-600"
            placeholder={t('calculator:placeholder_enter_number_cuts')}
          />
        </div>
      )}

      {!isInProjectCreating && (
        <CompactorSelector selectedCompactor={selectedCompactor} onCompactorChange={setSelectedCompactor} />
      )}

      {!isInProjectCreating && (
        <div className="mt-4 space-y-3">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={calculateDigging}
              onChange={(e) => setCalculateDigging(e.target.checked)}
              className="rounded border-gray-300 text-blue-500 focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-gray-700">{t('calculator:calculate_digging_prep')}</span>
          </label>
        </div>
      )}

      {!isInProjectCreating && (
        <div className="mt-4">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={effectiveCalculateTransport}
              onChange={(e) => effectiveSetCalculateTransport(e.target.checked)}
              className="rounded border-gray-300 text-blue-500 focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-gray-700">{t('calculator:calculate_transport_time_label')}</span>
          </label>
        </div>
      )}

      {calculateDigging && (
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">{t('calculator:excavation_machinery')}</label>
            <div className="space-y-2">
              {excavators.map((exc) => (
                <div key={exc.id} className="flex items-center p-2 cursor-pointer" onClick={() => setSelectedExcavator(exc)}>
                  <div className={`w-4 h-4 rounded-full border mr-2 ${selectedExcavator?.id === exc.id ? 'border-gray-400' : 'border-gray-400'}`}>
                    <div className={`w-2 h-2 rounded-full m-0.5 ${selectedExcavator?.id === exc.id ? 'bg-gray-400' : 'bg-transparent'}`} />
                  </div>
                  <span className="text-gray-800">{exc.name}</span>
                  <span className="text-sm text-gray-600 ml-2">({exc["size (in tones)"]} tons)</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">{t('calculator:carrier_machinery')}</label>
            <div className="space-y-2">
              {carriers.map((car) => (
                <div key={car.id} className="flex items-center p-2 cursor-pointer" onClick={() => setSelectedCarrier(car)}>
                  <div className={`w-4 h-4 rounded-full border mr-2 ${selectedCarrier?.id === car.id ? 'border-gray-400' : 'border-gray-400'}`}>
                    <div className={`w-2 h-2 rounded-full m-0.5 ${selectedCarrier?.id === car.id ? 'bg-gray-400' : 'bg-transparent'}`} />
                  </div>
                  <span className="text-gray-800">{car.name}</span>
                  <span className="text-sm text-gray-600 ml-2">({car["size (in tones)"]} tons)</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {calculateDigging && selectedCarrier && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">{t('calculator:transport_distance_label')}</label>
          <input
            type="number"
            value={soilTransportDistance}
            onChange={(e) => { setSoilTransportDistance(e.target.value); setTape1TransportDistance(e.target.value); }}
            className="w-full p-2 border rounded-md"
            placeholder={t('calculator:placeholder_enter_transport_distance')}
            min="0"
            step="1"
          />
        </div>
      )}

      {!isInProjectCreating && effectiveCalculateTransport && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">{t('calculator:transport_carrier')}</label>
          <div className="space-y-2">
            <div className="flex items-center p-2 cursor-pointer border-2 border-dashed border-gray-300 rounded" onClick={() => effectiveSetSelectedTransportCarrier(null)}>
              <div className="w-4 h-4 rounded-full border mr-2" />
              <span className="text-gray-800">{t('calculator:default_wheelbarrow')}</span>
            </div>
            {(isInProjectCreating ? propCarriers : carriers).map((carrier: DiggingEquipment) => (
              <div key={carrier.id} className="flex items-center p-2 cursor-pointer" onClick={() => effectiveSetSelectedTransportCarrier(carrier)}>
                <div className={`w-4 h-4 rounded-full border mr-2 ${effectiveSelectedTransportCarrier?.id === carrier.id ? 'border-gray-400' : 'border-gray-400'}`}>
                  <div className={`w-2 h-2 rounded-full m-0.5 ${effectiveSelectedTransportCarrier?.id === carrier.id ? 'bg-gray-400' : 'bg-transparent'}`} />
                </div>
                <span className="text-gray-800">{carrier.name}</span>
                <span className="text-sm text-gray-600 ml-2">({carrier["size (in tones)"]} tons)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isInProjectCreating && effectiveCalculateTransport && (
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
        </div>
      )}

      <button
        onClick={calculate}
        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
      >
        {t('calculator:calculate_button')}
      </button>

      {calculationError && (
        <div className="mt-4 p-4 bg-red-900/90 border border-red-600 rounded-lg text-white">{calculationError}</div>
      )}

      {totalHours !== null && (
        <div className="mt-6 space-y-4" ref={resultsRef}>
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('calculator:material_label')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('calculator:quantity_label')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('calculator:unit_label')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('calculator:price_per_unit_label')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('calculator:total_price_label')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {materials.map((material, index) => (
                    <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{material.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{material.amount.toFixed(2)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{translateUnit(material.unit, t)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{material.price_per_unit ? `£${material.price_per_unit.toFixed(2)}` : 'N/A'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{material.total_price ? `£${material.total_price.toFixed(2)}` : 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 text-right pr-6">
                <p className="text-sm font-medium">
                  {t('calculator:total_cost_colon')} {materials.some(m => m.total_price !== null) ? `£${materials.reduce((sum, m) => sum + (m.total_price || 0), 0).toFixed(2)}` : t('calculator:not_available')}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConcreteSlabsCalculator;
