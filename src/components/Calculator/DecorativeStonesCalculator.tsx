import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { carrierSpeeds, getMaterialCapacity, DEFAULT_CARRIER_SPEED_M_PER_H } from '../../constants/materialCapacity';
import { translateTaskName, translateUnit, translateMaterialName } from '../../lib/translationMap';
import { CompactorSelector, type CompactorOption } from './CompactorSelector';
import { calculateCompactingTime } from '../../lib/compactingCalculations';
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
  DataTable,
} from '../../themes/uiComponents';
import { taskMatchesDecorativeStonesFallback, taskMatchesDecorativeStonesWork } from './decorativeStonesTaskFilter';
import type { VizGravelTone } from '../../projectmanagement/canvacreator/visualization/gravelPattern';

function parseVizGravelTone(saved: Record<string, any> | undefined): VizGravelTone {
  const t = saved?.vizGravelTone;
  if (t === 'light' || t === 'medium' || t === 'dark' || t === 'twoTone') return t;
  const L = Number(saved?.vizGravelLightness);
  if (Number.isFinite(L)) {
    if (L < 34) return 'dark';
    if (L < 67) return 'medium';
    return 'light';
  }
  return 'medium';
}

const STONE_BARROW_TONNES = 0.125;
const SOIL_TONNES_PER_M3 = 1.5;
const TAPE1_TONNES_PER_M3 = 2.1;

const GRAVEL_DENSITY_T_M3: Record<string, number> = {
  fine: 1.6,
  medium: 1.5,
  coarse: 1.4,
};

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
  company_id?: string;
}

interface DiggingEquipment {
  id: string;
  name: string;
  type: string;
  'size (in tones)': number | null;
  speed_m_per_hour?: number | null;
  company_id?: string | null;
}

interface DecorativeStonesCalculatorProps {
  onResultsChange?: (results: any) => void;
  onInputsChange?: (inputs: Record<string, any>) => void;
  isInProjectCreating?: boolean;
  initialArea?: number;
  savedInputs?: Record<string, any>;
  calculateTransport?: boolean;
  setCalculateTransport?: (value: boolean) => void;
  selectedTransportCarrier?: any;
  setSelectedTransportCarrier?: (value: any) => void;
  transportDistance?: string;
  setTransportDistance?: (value: string) => void;
  carriers?: any[];
  selectedExcavator?: any;
  /** Haul carrier for soil / tape1 (project card) */
  selectedCarrier?: any;
  selectedCompactor?: CompactorOption | null;
  recalculateTrigger?: number;
}

const DecorativeStonesCalculator: React.FC<DecorativeStonesCalculatorProps> = ({
  onResultsChange,
  onInputsChange,
  isInProjectCreating = false,
  initialArea,
  savedInputs = {},
  calculateTransport: propCalculateTransport,
  setCalculateTransport: propSetCalculateTransport,
  transportDistance: propTransportDistance,
  carriers: propCarriers = [],
  selectedExcavator: propSelectedExcavator,
  selectedCarrier: propSelectedCarrier,
  selectedCompactor: propSelectedCompactor,
  recalculateTrigger = 0,
}) => {
  const { t } = useTranslation(['calculator', 'utilities', 'common', 'units']);
  const companyId = useAuthStore((s) => s.getCompanyId());

  const initArea =
    savedInputs?.area != null
      ? String(savedInputs.area)
      : initialArea != null
        ? initialArea.toFixed(3)
        : '';
  const [area, setArea] = useState<string>(initArea);
  const [decorativeDepthCm, setDecorativeDepthCm] = useState<string>(
    savedInputs?.decorativeDepthCm ?? ''
  );
  const [addSubBase, setAddSubBase] = useState<boolean>(!!savedInputs?.addSubBase);
  const [tape1ThicknessCm, setTape1ThicknessCm] = useState<string>(savedInputs?.tape1ThicknessCm ?? '');
  const [gravelSize, setGravelSize] = useState<string>(savedInputs?.gravelSize ?? 'medium');
  const [vizGravelTone, setVizGravelTone] = useState<VizGravelTone>(() => parseVizGravelTone(savedInputs));
  const [calculateDigging, setCalculateDigging] = useState<boolean>(!!savedInputs?.calculateDigging);

  const [selectedExcavator, setSelectedExcavator] = useState<DiggingEquipment | null>(null);
  const [selectedCarrier, setSelectedCarrier] = useState<DiggingEquipment | null>(null);
  const [excavators, setExcavators] = useState<DiggingEquipment[]>([]);
  const [carriersLocal, setCarriersLocal] = useState<DiggingEquipment[]>([]);
  const [soilTransportDistance, setSoilTransportDistance] = useState<string>(
    savedInputs?.soilTransportDistance ?? '30'
  );
  const [materialTransportDistance, setMaterialTransportDistance] = useState<string>('30');
  const [calculateTransport, setCalculateTransport] = useState<boolean>(false);
  const [selectedCompactor, setSelectedCompactor] = useState<CompactorOption | null>(null);

  const [materials, setMaterials] = useState<Material[]>([]);
  const [totalHours, setTotalHours] = useState<number | null>(null);
  const [calculationError, setCalculationError] = useState<string | null>(null);
  const [taskBreakdown, setTaskBreakdown] = useState<
    { task: string; hours: number; amount: number | string; unit: string; event_task_id?: string }[]
  >([]);
  const resultsRef = useRef<HTMLDivElement>(null);
  const lastInputsPayloadRef = useRef<string>('');
  const onInputsChangeRef = useRef(onInputsChange);
  onInputsChangeRef.current = onInputsChange;
  const onResultsChangeRef = useRef(onResultsChange);
  onResultsChangeRef.current = onResultsChange;

  const carriers = propCarriers.length > 0 ? propCarriers : carriersLocal;
  const effectiveCompactor =
    isInProjectCreating && propSelectedCompactor ? propSelectedCompactor : selectedCompactor;
  /** On canvas, excavation / soil–Type 1 labour is handled in preparation; hide digging UI and skip those lines here. */
  const diggingEnabled = !isInProjectCreating && calculateDigging;
  const effectiveCalculateTransport = isInProjectCreating
    ? (propCalculateTransport ?? false)
    : calculateTransport;
  const effectiveMaterialTransportDistance =
    isInProjectCreating && propTransportDistance ? propTransportDistance : materialTransportDistance;
  const effectiveSoilTape1DistanceMeters =
    isInProjectCreating && propTransportDistance
      ? parseFloat(propTransportDistance) || 0
      : parseFloat(soilTransportDistance) || 0;

  useEffect(() => {
    if (savedInputs?.area != null) setArea(String(savedInputs.area));
    else if (initialArea != null && isInProjectCreating) setArea(initialArea.toFixed(3));
  }, [savedInputs?.area, initialArea, isInProjectCreating]);

  useEffect(() => {
    if (!isInProjectCreating) return;
    if (propCalculateTransport !== undefined) setCalculateTransport(propCalculateTransport);
    if (propTransportDistance !== undefined) {
      setMaterialTransportDistance(propTransportDistance);
    }
  }, [isInProjectCreating, propCalculateTransport, propTransportDistance]);

  useEffect(() => {
    if (savedInputs?.decorativeDepthCm != null && savedInputs.decorativeDepthCm !== '')
      setDecorativeDepthCm(String(savedInputs.decorativeDepthCm));
    if (savedInputs?.tape1ThicknessCm != null && savedInputs.tape1ThicknessCm !== '')
      setTape1ThicknessCm(String(savedInputs.tape1ThicknessCm));
    if (savedInputs?.gravelSize != null) setGravelSize(String(savedInputs.gravelSize));
    setVizGravelTone(parseVizGravelTone(savedInputs));
    if (savedInputs?.addSubBase !== undefined) setAddSubBase(!!savedInputs.addSubBase);
    if (savedInputs?.calculateDigging !== undefined) setCalculateDigging(!!savedInputs.calculateDigging);
  }, [
    savedInputs?.decorativeDepthCm,
    savedInputs?.tape1ThicknessCm,
    savedInputs?.gravelSize,
    savedInputs?.vizGravelTone,
    savedInputs?.vizGravelLightness,
    savedInputs?.addSubBase,
    savedInputs?.calculateDigging,
  ]);

  useEffect(() => {
    const fn = onInputsChangeRef.current;
    if (!fn || !isInProjectCreating) return;
    const payload = {
      area,
      decorativeDepthCm,
      addSubBase,
      tape1ThicknessCm: addSubBase ? tape1ThicknessCm : '',
      gravelSize,
      vizGravelTone,
      calculateDigging: diggingEnabled,
      soilTransportDistance,
    };
    const s = JSON.stringify(payload);
    if (s !== lastInputsPayloadRef.current) {
      lastInputsPayloadRef.current = s;
      fn(payload);
    }
  }, [
    area,
    decorativeDepthCm,
    addSubBase,
    tape1ThicknessCm,
    gravelSize,
    vizGravelTone,
    diggingEnabled,
    soilTransportDistance,
    isInProjectCreating,
  ]);

  const { data: taskTemplatesData = [] } = useQuery({
    queryKey: ['task_templates', companyId || 'no-company'],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId,
  });

  /** Main work: rates from event_tasks / event_tasks_with_dynamic_estimates (same source as other calculators). */
  const mainWorkTaskOptions = useMemo(() => {
    const all = taskTemplatesData as { id: string; name: string; unit?: string; estimated_hours?: number | null }[];
    const primary = all.filter((tpl) => taskMatchesDecorativeStonesWork(tpl.name || ''));
    if (primary.length > 0) return primary;
    const fallback = all.filter((tpl) => taskMatchesDecorativeStonesFallback(tpl.name || ''));
    return fallback;
  }, [taskTemplatesData]);

  const { data: materialUsageConfig } = useQuery<MaterialUsageConfig[]>({
    queryKey: ['materialUsageConfig', 'decorative_stones', companyId || 'no-company'],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('material_usage_configs')
        .select('calculator_id, material_id, company_id')
        .eq('calculator_id', 'decorative_stones')
        .eq('company_id', companyId);
      if (error) throw error;
      return data as MaterialUsageConfig[];
    },
    enabled: !!companyId,
  });

  const selectedMaterialId = materialUsageConfig?.[0]?.material_id;
  const { data: decorativeMaterial } = useQuery({
    queryKey: ['material', selectedMaterialId || 'none', companyId],
    queryFn: async () => {
      if (!companyId || !selectedMaterialId) return null;
      const { data, error } = await supabase
        .from('materials')
        .select('id, name, unit, price')
        .eq('company_id', companyId)
        .eq('id', selectedMaterialId)
        .single();
      if (error) throw error;
      return data as { name: string; unit: string; price: number | null };
    },
    enabled: !!companyId && !!selectedMaterialId,
  });

  const { data: finalLevelingTypeOneTask } = useQuery({
    queryKey: ['final_leveling_type_one_task', companyId || 'no-company'],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId)
        .eq('name', 'final leveling (type 1)')
        .single();
      if (error && (error as any).code !== 'PGRST116') throw error;
      return data;
    },
    enabled: !!companyId,
  });

  useEffect(() => {
    if (!diggingEnabled && !effectiveCalculateTransport) return;
    const fetchEquipment = async () => {
      try {
        const cid = useAuthStore.getState().getCompanyId();
        if (!cid) return;
        const [excRes, carRes] = await Promise.all([
          supabase.from('setup_digging').select('*').eq('type', 'excavator').eq('company_id', cid),
          supabase.from('setup_digging').select('*').eq('type', 'barrows_dumpers').eq('company_id', cid),
        ]);
        if (excRes.error) throw excRes.error;
        if (carRes.error) throw carRes.error;
        setExcavators(excRes.data || []);
        setCarriersLocal(carRes.data || []);
      } catch (e) {
        console.error(e);
      }
    };
    void fetchEquipment();
  }, [calculateDigging, effectiveCalculateTransport]);

  const loadingShovelTimeEstimates = [
    { sizeInTons: 0.02, timePerTon: 0.5 },
    { sizeInTons: 0.5, timePerTon: 0.36 },
    { sizeInTons: 1, timePerTon: 0.18 },
    { sizeInTons: 2, timePerTon: 0.12 },
    { sizeInTons: 3, timePerTon: 0.08 },
    { sizeInTons: 6, timePerTon: 0.05 },
    { sizeInTons: 11, timePerTon: 0.03 },
    { sizeInTons: 21, timePerTon: 0.02 },
    { sizeInTons: 31, timePerTon: 0.01 },
    { sizeInTons: 41, timePerTon: 0.005 },
  ];

  const findLoadingShovelTimePerTon = (): number => loadingShovelTimeEstimates[0].timePerTon;

  const calculateMaterialTransportTime = (
    materialAmount: number,
    carrierSize: number,
    materialType: string,
    transportDistanceMeters: number
  ) => {
    const carrierSpeedData = carrierSpeeds.find((c) => c.size === carrierSize);
    const carrierSpeed = carrierSpeedData?.speed || DEFAULT_CARRIER_SPEED_M_PER_H;
    const materialCapacityUnits = getMaterialCapacity(materialType, carrierSize);
    const trips = Math.ceil(materialAmount / materialCapacityUnits);
    const timePerTrip = (transportDistanceMeters * 2) / carrierSpeed;
    return trips * timePerTrip;
  };

  const fetchMaterialPrices = async (list: Material[]): Promise<Material[]> => {
    try {
      if (!companyId) return list;
      const names = list.map((m) => m.name);
      const { data, error } = await supabase
        .from('materials')
        .select('name, price')
        .eq('company_id', companyId)
        .in('name', names);
      if (error) throw error;
      const priceMap = (data as { name: string; price: number }[]).reduce(
        (acc, item) => {
          acc[item.name] = item.price;
          return acc;
        },
        {} as Record<string, number>
      );
      return list.map((m) => ({
        ...m,
        price_per_unit: priceMap[m.name] ?? null,
        total_price: priceMap[m.name] != null ? priceMap[m.name] * m.amount : null,
      }));
    } catch {
      return list.map((m) => ({ ...m, price_per_unit: null, total_price: null }));
    }
  };

  const calculate = async () => {
    if (!area || !decorativeDepthCm) {
      setCalculationError(t('calculator:decorative_stones_fill_required'));
      return;
    }
    if (addSubBase && !tape1ThicknessCm) {
      setCalculationError(t('calculator:enter_aggregate_thickness'));
      return;
    }
    const layingTask = mainWorkTaskOptions[0] as
      | { id: string; name: string; unit?: string; estimated_hours?: number | null }
      | undefined;
    if (!layingTask) {
      setCalculationError(t('calculator:decorative_stones_work_task_empty_hint'));
      return;
    }

    setCalculationError(null);

    try {
      const areaNum = parseFloat(area);
      const decorativeM = parseFloat(decorativeDepthCm) / 100;
      const tape1M = addSubBase && tape1ThicknessCm ? parseFloat(tape1ThicknessCm) / 100 : 0;
      const density = GRAVEL_DENSITY_T_M3[gravelSize] ?? GRAVEL_DENSITY_T_M3.medium;

      const totalExcavationM = tape1M + decorativeM;
      const soilVolumeM3 = areaNum * totalExcavationM;
      const soilTonnes = soilVolumeM3 * SOIL_TONNES_PER_M3;

      const tape1VolumeM3 = areaNum * tape1M;
      const tape1Tonnes = tape1VolumeM3 * TAPE1_TONNES_PER_M3;

      const stoneVolumeM3 = areaNum * decorativeM;
      const stoneTonnes = stoneVolumeM3 * density;

      type BreakRow = {
        task: string;
        hours: number;
        amount: number | string;
        unit: string;
        event_task_id?: string;
      };
      const digAndPrepTransport: BreakRow[] = [];
      const subBaseFinish: BreakRow[] = [];
      const decorativeFinish: BreakRow[] = [];

      const soilTonnesR = Number(soilTonnes.toFixed(2));
      const tape1TonnesR = Number(tape1Tonnes.toFixed(2));
      const stoneTonnesR = Number(stoneTonnes.toFixed(2));
      const areaR = Number(areaNum.toFixed(2));

      const activeExcavator =
        isInProjectCreating && propSelectedExcavator ? propSelectedExcavator : selectedExcavator;
      const activeDiggingCarrier =
        isInProjectCreating && propSelectedCarrier ? propSelectedCarrier : selectedCarrier;

      if (diggingEnabled && activeExcavator) {
        const excavatorSize = activeExcavator['size (in tones)'] || 0;
        const excavatorName = activeExcavator.name || '';

        const soilTpl = (taskTemplatesData as any[]).find((template: any) => {
          const name = (template.name || '').toLowerCase();
          return (
            name.includes('excavation soil') &&
            name.includes(excavatorName.toLowerCase()) &&
            name.includes(`(${excavatorSize}t)`)
          );
        });
        const soilExcHours =
          soilTpl?.estimated_hours != null ? soilTpl.estimated_hours * soilTonnes : 0;

        let tape1Tpl: { id?: string; estimated_hours?: number | null } | undefined;
        let tape1LoadH = 0;
        if (tape1M > 0) {
          tape1Tpl = (taskTemplatesData as any[]).find((template: any) => {
            const name = (template.name || '').toLowerCase();
            return (
              name.includes('loading tape1') &&
              name.includes(excavatorName.toLowerCase()) &&
              name.includes(`(${excavatorSize}t)`)
            );
          });
          tape1LoadH =
            tape1Tpl?.estimated_hours != null ? tape1Tpl.estimated_hours * tape1Tonnes : 0;
        }

        if (soilExcHours > 0) {
          digAndPrepTransport.push({
            task: 'Soil excavation',
            hours: soilExcHours,
            amount: soilTonnesR,
            unit: 'tonnes',
            event_task_id: soilTpl?.id,
          });
        }

        if (activeDiggingCarrier?.speed_m_per_hour) {
          const d = effectiveSoilTape1DistanceMeters;
          if (d > 0 && soilTonnes > 0) {
            const cap = getMaterialCapacity('soil', activeDiggingCarrier['size (in tones)'] || 0);
            const trips = Math.ceil(soilTonnes / cap);
            const h = (trips * d * 2) / activeDiggingCarrier.speed_m_per_hour;
            digAndPrepTransport.push({
              task: `Transporting soil (${d}m)`,
              hours: h,
              amount: soilTonnesR,
              unit: 'tonnes',
            });
          }
        }

        if (tape1M > 0 && tape1LoadH > 0) {
          digAndPrepTransport.push({
            task: 'Loading tape1',
            hours: tape1LoadH,
            amount: tape1TonnesR,
            unit: 'tonnes',
            event_task_id: tape1Tpl?.id,
          });
        }

        if (activeDiggingCarrier?.speed_m_per_hour) {
          const d = effectiveSoilTape1DistanceMeters;
          if (d > 0 && tape1M > 0 && tape1Tonnes > 0) {
            const cap = getMaterialCapacity('tape1', activeDiggingCarrier['size (in tones)'] || 0);
            const trips = Math.ceil(tape1Tonnes / cap);
            const h = (trips * d * 2) / activeDiggingCarrier.speed_m_per_hour;
            digAndPrepTransport.push({
              task: `Transporting tape1 (${d}m)`,
              hours: h,
              amount: tape1TonnesR,
              unit: 'tonnes',
            });
          }
        }
      }

      let compactingTimeTotal = 0;
      let compactingName = '';
      if (effectiveCompactor && tape1M > 0 && addSubBase) {
        const tape1DepthCm = parseFloat(tape1ThicknessCm || '0');
        if (tape1DepthCm > 0) {
          const cc = calculateCompactingTime(effectiveCompactor, tape1DepthCm, 'type1');
          compactingTimeTotal = areaNum * cc.timePerM2 * cc.totalPasses;
          compactingName = cc.compactorTaskName;
        }
      }
      if (compactingTimeTotal > 0 && compactingName) {
        subBaseFinish.push({
          task: compactingName,
          hours: compactingTimeTotal,
          amount: areaR,
          unit: 'square meters',
        });
      }

      if (finalLevelingTypeOneTask?.estimated_hours != null && tape1M > 0) {
        subBaseFinish.push({
          task: 'final leveling (type 1)',
          hours: areaNum * finalLevelingTypeOneTask.estimated_hours,
          amount: areaR,
          unit: 'square meters',
          event_task_id: finalLevelingTypeOneTask.id,
        });
      }

      const shovelPerTon = findLoadingShovelTimePerTon();
      if (stoneTonnes > 0) {
        decorativeFinish.push({
          task: 'Loading decorative stones (shovel)',
          hours: shovelPerTon * stoneTonnes,
          amount: stoneTonnesR,
          unit: 'tonnes',
        });
      }

      if (effectiveCalculateTransport && stoneTonnes > 0) {
        const dist = parseFloat(effectiveMaterialTransportDistance) || 0;
        if (dist > 0) {
          const h = calculateMaterialTransportTime(
            stoneTonnes,
            STONE_BARROW_TONNES,
            'decorativeStones',
            dist
          );
          decorativeFinish.push({
            task: `Transporting decorative stones (${dist}m)`,
            hours: h,
            amount: stoneTonnesR,
            unit: 'tonnes',
          });
        }
      }

      let mainHours = 0;
      if (layingTask.estimated_hours != null) {
        mainHours = areaNum * layingTask.estimated_hours;
      }
      if (mainHours > 0) {
        decorativeFinish.push({
          task: layingTask.name,
          hours: mainHours,
          amount: areaR,
          unit: 'square meters',
          event_task_id: layingTask.id,
        });
      }

      const breakdown = [...digAndPrepTransport, ...subBaseFinish, ...decorativeFinish];

      const hoursTotal = breakdown.reduce((s, x) => s + x.hours, 0);

      const stoneLabel = decorativeMaterial?.name || t('calculator:decorative_stones_material_name');
      const materialsList: Material[] = [
        { name: 'Soil excavation', amount: Number(soilTonnes.toFixed(2)), unit: 'tonnes', price_per_unit: null, total_price: null },
        ...(tape1M > 0
          ? [
              {
                name: 'tape1',
                amount: Number(tape1Tonnes.toFixed(2)),
                unit: 'tonnes',
                price_per_unit: null,
                total_price: null,
              } as Material,
            ]
          : []),
        {
          name: stoneLabel,
          amount: Number(stoneTonnes.toFixed(2)),
          unit: 'tonnes',
          price_per_unit: decorativeMaterial?.price ?? null,
          total_price: null,
        },
      ];

      const priced = await fetchMaterialPrices(materialsList);
      setMaterials(priced);
      setTotalHours(hoursTotal);
      setTaskBreakdown(breakdown);
    } catch (e) {
      console.error(e);
      setCalculationError(t('calculator:calculation_error'));
    }
  };

  useEffect(() => {
    if (recalculateTrigger > 0 && isInProjectCreating) void calculate();
  }, [recalculateTrigger]);

  useEffect(() => {
    if (totalHours === null || materials.length === 0) return;
    const formatted = {
      name: t('calculator:decorative_stones_results_name'),
      amount: parseFloat(area) || 0,
      unit: 'square meters',
      hours_worked: totalHours,
      materials: materials.map((m) => ({ name: m.name, quantity: m.amount, unit: m.unit })),
      taskBreakdown: taskBreakdown.map((tb) => ({
        task: tb.task,
        hours: tb.hours,
        amount: tb.amount,
        unit: tb.unit,
        event_task_id: tb.event_task_id,
      })),
    };
    const el = document.querySelector('[data-calculator-results]');
    if (el) el.setAttribute('data-results', JSON.stringify(formatted));
    onResultsChangeRef.current?.(formatted);
  }, [totalHours, materials, taskBreakdown, area, t]);

  const gravelOptions = [
    { value: 'fine', label: t('calculator:decorative_gravel_fine') },
    { value: 'medium', label: t('calculator:decorative_gravel_medium') },
    { value: 'coarse', label: t('calculator:decorative_gravel_coarse') },
  ];

  const gravelVizToneOptions: { value: VizGravelTone; label: string }[] = [
    { value: 'light', label: t('calculator:decorative_gravel_viz_tone_light') },
    { value: 'medium', label: t('calculator:decorative_gravel_viz_tone_medium') },
    { value: 'dark', label: t('calculator:decorative_gravel_viz_tone_dark') },
    { value: 'twoTone', label: t('calculator:decorative_gravel_viz_tone_two_tone') },
  ];

  return (
    <div style={{ fontFamily: fonts.body, display: 'flex', flexDirection: 'column', gap: spacing['6xl'] }}>
      <h2
        style={{
          fontSize: fontSizes['2xl'],
          fontWeight: fontWeights.extrabold,
          color: colors.textPrimary,
          fontFamily: fonts.display,
          margin: `${spacing.md}px 0 ${spacing.sm}px`,
        }}
      >
        {t('calculator:decorative_stones_title')}
      </h2>
      <p style={{ fontSize: fontSizes.base, color: colors.textDim, lineHeight: 1.5 }}>
        {t('calculator:decorative_stones_description')}
      </p>

      <Card padding={`${spacing['6xl']}px`} style={{ marginBottom: spacing['5xl'] }}>
        <TextInput
          label={t('calculator:input_area_m2')}
          value={area}
          onChange={setArea}
          placeholder={t('calculator:placeholder_enter_area_m2')}
          unit="m²"
        />

        <CalculatorInputGrid columns={2}>
          <TextInput
            label={t('calculator:decorative_stones_depth_cm')}
            value={decorativeDepthCm}
            onChange={setDecorativeDepthCm}
            placeholder={t('calculator:placeholder_enter_thickness')}
            unit="cm"
          />
          <SelectDropdown
            label={t('calculator:decorative_gravel_size_label')}
            value={gravelSize}
            options={gravelOptions.map((o) => ({ value: o.value, label: o.label }))}
            onChange={setGravelSize}
            placeholder={t('calculator:decorative_gravel_size_label')}
          />
        </CalculatorInputGrid>

        {isInProjectCreating && (
          <div style={{ marginTop: spacing.xl }}>
            <SelectDropdown
              label={t('calculator:decorative_gravel_viz_tone_label')}
              value={vizGravelTone}
              options={gravelVizToneOptions.map((o) => ({ value: o.value, label: o.label }))}
              onChange={(v) => setVizGravelTone(v as VizGravelTone)}
              placeholder={t('calculator:decorative_gravel_viz_tone_label')}
            />
          </div>
        )}

        <div style={{ marginTop: spacing.xl }}>
          <Checkbox
            label={t('calculator:decorative_stones_sub_base')}
            checked={addSubBase}
            onChange={setAddSubBase}
          />
        </div>
        {addSubBase && (
          <>
            <TextInput
              label={t('calculator:input_type1_thickness_cm')}
              value={tape1ThicknessCm}
              onChange={setTape1ThicknessCm}
              placeholder={t('calculator:placeholder_enter_thickness')}
              unit="cm"
            />
            {!isInProjectCreating && (
              <div style={{ marginTop: spacing.xl }}>
                <CompactorSelector selectedCompactor={selectedCompactor} onCompactorChange={setSelectedCompactor} />
              </div>
            )}
          </>
        )}

        {!isInProjectCreating && (
          <Checkbox
            label={t('calculator:calculate_digging_prep')}
            checked={calculateDigging}
            onChange={setCalculateDigging}
          />
        )}

        {diggingEnabled && (
          <div style={{ marginTop: spacing.md }}>
            {isInProjectCreating ? (
              <p style={{ fontSize: fontSizes.sm, color: colors.textDim }}>
                {t('calculator:decorative_stones_project_equipment_hint')}
              </p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing['5xl'] }}>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: fontSizes.sm,
                      fontWeight: fontWeights.medium,
                      color: colors.textMuted,
                      marginBottom: spacing.lg,
                    }}
                  >
                    {t('calculator:excavation_machinery')}
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                    {excavators.length === 0 ? (
                      <p style={{ color: colors.textDim }}>{t('calculator:no_excavators_found')}</p>
                    ) : (
                      excavators.map((exc) => (
                        <div
                          key={exc.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: `${spacing.lg}px ${spacing['2xl']}px`,
                            cursor: 'pointer',
                            borderRadius: radii.lg,
                            background: selectedExcavator?.id === exc.id ? colors.bgHover : 'transparent',
                            border: `1px solid ${selectedExcavator?.id === exc.id ? colors.accentBlueBorder : colors.borderLight}`,
                          }}
                          onClick={() => setSelectedExcavator(exc)}
                        >
                          <div
                            style={{
                              width: 16,
                              height: 16,
                              borderRadius: radii.full,
                              border: `2px solid ${selectedExcavator?.id === exc.id ? colors.accentBlue : colors.borderMedium}`,
                              marginRight: spacing.md,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {selectedExcavator?.id === exc.id && (
                              <div
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: radii.full,
                                  background: colors.accentBlue,
                                }}
                              />
                            )}
                          </div>
                          <span style={{ color: colors.textSecondary }}>{exc.name}</span>
                          <span style={{ fontSize: fontSizes.sm, color: colors.textDim, marginLeft: 8 }}>
                            ({exc['size (in tones)']}t)
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: fontSizes.sm,
                      fontWeight: fontWeights.medium,
                      color: colors.textMuted,
                      marginBottom: spacing.lg,
                    }}
                  >
                    {t('calculator:carrier_machinery')}
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                    {carriers.length === 0 ? (
                      <p style={{ color: colors.textDim }}>{t('calculator:no_carriers_found')}</p>
                    ) : (
                      carriers.map((car) => (
                        <div
                          key={car.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: `${spacing.lg}px ${spacing['2xl']}px`,
                            cursor: 'pointer',
                            borderRadius: radii.lg,
                            background: selectedCarrier?.id === car.id ? colors.bgHover : 'transparent',
                            border: `1px solid ${selectedCarrier?.id === car.id ? colors.accentBlueBorder : colors.borderLight}`,
                          }}
                          onClick={() => setSelectedCarrier(car)}
                        >
                          <div
                            style={{
                              width: 16,
                              height: 16,
                              borderRadius: radii.full,
                              border: `2px solid ${selectedCarrier?.id === car.id ? colors.accentBlue : colors.borderMedium}`,
                              marginRight: spacing.md,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {selectedCarrier?.id === car.id && (
                              <div
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: radii.full,
                                  background: colors.accentBlue,
                                }}
                              />
                            )}
                          </div>
                          <span style={{ color: colors.textSecondary }}>{car.name}</span>
                          <span style={{ fontSize: fontSizes.sm, color: colors.textDim, marginLeft: 8 }}>
                            ({car['size (in tones)']}t)
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {diggingEnabled && selectedCarrier && (
          <TextInput
            label={t('calculator:transport_distance_label')}
            value={soilTransportDistance}
            onChange={(v) => {
              setSoilTransportDistance(v);
            }}
            placeholder={t('calculator:placeholder_enter_transport_distance')}
            unit="m"
            helperText={t('calculator:set_to_zero_no_transport')}
          />
        )}
        {!isInProjectCreating && (
          <Checkbox
            label={t('calculator:calculate_transport_time_label')}
            checked={calculateTransport}
            onChange={setCalculateTransport}
          />
        )}

        {effectiveCalculateTransport && (
          <div style={{ marginTop: spacing.md, padding: spacing.md, background: colors.bgSubtle, borderRadius: radii.md }}>
            <p style={{ fontSize: fontSizes.sm, color: colors.textDim, marginBottom: spacing.sm }}>
              {t('calculator:decorative_stones_barrow_transport_note')}
            </p>
            {!isInProjectCreating && (
              <TextInput
                label={t('calculator:transport_distance_label')}
                value={materialTransportDistance}
                onChange={setMaterialTransportDistance}
                placeholder={t('calculator:placeholder_enter_material_transport')}
                unit="m"
              />
            )}
            {isInProjectCreating && (
              <p style={{ fontSize: fontSizes.sm, color: colors.textDim }}>
                {t('calculator:decorative_stones_material_distance_project_hint')}
              </p>
            )}
          </div>
        )}

        <Button variant="primary" onClick={() => void calculate()} fullWidth style={{ marginTop: spacing.xl }}>
          {t('calculator:calculate_button')}
        </Button>

        {calculationError && (
          <div
            style={{
              marginTop: spacing.md,
              padding: spacing.md,
              background: `${colors.red}18`,
              border: `1px solid ${colors.red}44`,
              borderRadius: radii.md,
              color: colors.textPrimary,
            }}
          >
            {calculationError}
          </div>
        )}
      </Card>

      {totalHours !== null && (
        <div
          ref={resultsRef}
          style={{ marginTop: spacing['6xl'], display: 'flex', flexDirection: 'column', gap: spacing['5xl'] }}
        >
          <h3 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.bold, marginBottom: 0, color: colors.textPrimary }}>
            {t('calculator:results')}
          </h3>
          <Card style={{ background: gradients.blueCard, border: `1px solid ${colors.accentBlueBorder}` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: spacing.lg, flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: fontSizes.md,
                  color: colors.textSubtle,
                  fontFamily: fonts.display,
                  fontWeight: fontWeights.semibold,
                }}
              >
                {t('calculator:total_labor_hours_label')}
              </span>
              <span
                style={{
                  fontSize: fontSizes['4xl'],
                  fontWeight: fontWeights.extrabold,
                  color: colors.accentBlue,
                  fontFamily: fonts.display,
                }}
              >
                {totalHours.toFixed(2)}
              </span>
              <span
                style={{
                  fontSize: fontSizes.md,
                  color: colors.accentBlue,
                  fontFamily: fonts.body,
                  fontWeight: fontWeights.medium,
                }}
              >
                {t('calculator:hours_abbreviation')}
              </span>
            </div>
          </Card>
          <Card>
            <h3
              style={{
                fontSize: fontSizes.lg,
                fontWeight: fontWeights.bold,
                color: colors.textSecondary,
                fontFamily: fonts.display,
                letterSpacing: '0.3px',
                marginBottom: spacing['2xl'],
              }}
            >
              {t('calculator:task_breakdown_label')}
            </h3>
            <DataTable
              columns={[
                { key: 'task', label: t('calculator:table_task_work_header'), width: '2fr' },
                { key: 'quantity', label: t('calculator:table_quantity_header'), width: '1fr' },
                { key: 'unit', label: t('calculator:table_unit_header'), width: '1fr' },
                { key: 'hours', label: t('calculator:table_work_hours_header'), width: '1fr', align: 'right' },
              ]}
              rows={taskBreakdown.map((tb) => {
                const qty =
                  typeof tb.amount === 'number'
                    ? tb.amount.toFixed(2)
                    : (() => {
                        const p = parseFloat(String(tb.amount));
                        return Number.isFinite(p) ? p.toFixed(2) : String(tb.amount);
                      })();
                return {
                  task: (
                    <span style={{ fontSize: fontSizes.base, color: colors.textMuted, fontFamily: fonts.body }}>
                      {translateTaskName(tb.task, t)}
                    </span>
                  ),
                  quantity: (
                    <span style={{ fontSize: fontSizes.base, color: colors.textSubtle }}>{qty}</span>
                  ),
                  unit: (
                    <span style={{ fontSize: fontSizes.sm, color: colors.textDim }}>{translateUnit(tb.unit, t)}</span>
                  ),
                  hours: (
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: spacing.xs, justifyContent: 'flex-end' }}>
                      <span
                        style={{
                          fontSize: fontSizes.lg,
                          fontWeight: fontWeights.bold,
                          color: colors.textSecondary,
                          fontFamily: fonts.display,
                        }}
                      >
                        {tb.hours.toFixed(2)}
                      </span>
                      <span style={{ fontSize: fontSizes.sm, color: colors.textFaint, fontFamily: fonts.body }}>
                        {t('calculator:hours_label')}
                      </span>
                    </div>
                  ),
                };
              })}
            />
          </Card>
          {materials.length > 0 && (
            <DataTable
              columns={[
                { key: 'name', label: t('calculator:table_material_header'), width: '2fr' },
                { key: 'quantity', label: t('calculator:table_quantity_header'), width: '1fr' },
                { key: 'unit', label: t('calculator:table_unit_header'), width: '1fr' },
                { key: 'price', label: t('calculator:table_price_per_unit_header'), width: '1fr' },
                { key: 'total', label: t('calculator:table_total_header'), width: '1fr' },
              ]}
              rows={materials.map((m) => ({
                name: (
                  <span style={{ fontSize: fontSizes.base, color: colors.textMuted, fontFamily: fonts.body }}>
                    {translateMaterialName(m.name, t)}
                  </span>
                ),
                quantity: (
                  <span style={{ fontSize: fontSizes.base, color: colors.textSubtle }}>{Number(m.amount).toFixed(2)}</span>
                ),
                unit: <span style={{ fontSize: fontSizes.sm, color: colors.textDim }}>{translateUnit(m.unit, t)}</span>,
                price: (
                  <span style={{ fontSize: fontSizes.base, color: colors.textSubtle }}>
                    {m.price_per_unit != null ? `£${m.price_per_unit.toFixed(2)}` : 'N/A'}
                  </span>
                ),
                total: (
                  <span style={{ fontSize: fontSizes.md, fontWeight: fontWeights.bold, color: colors.textSecondary }}>
                    {m.total_price != null ? `£${m.total_price.toFixed(2)}` : 'N/A'}
                  </span>
                ),
              }))}
              footer={
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: spacing.md }}>
                  <span
                    style={{
                      fontSize: fontSizes.base,
                      color: colors.textSubtle,
                      fontFamily: fonts.display,
                      fontWeight: fontWeights.semibold,
                    }}
                  >
                    {t('calculator:total_cost_colon')}
                  </span>
                  <span
                    style={{
                      fontSize: fontSizes['2xl'],
                      fontWeight: fontWeights.extrabold,
                      color: colors.textPrimary,
                      fontFamily: fonts.display,
                    }}
                  >
                    {materials.some((m) => m.total_price != null)
                      ? `£${materials.reduce((sum, m) => sum + (m.total_price || 0), 0).toFixed(2)}`
                      : t('calculator:not_available')}
                  </span>
                </div>
              }
            />
          )}
        </div>
      )}
    </div>
  );
};

export default DecorativeStonesCalculator;
