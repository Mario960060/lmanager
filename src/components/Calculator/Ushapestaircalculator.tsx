import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import UShapeStairsSlabs from './Ushapestairsslabs';
import { carrierSpeeds, getMaterialCapacity } from '../../constants/materialCapacity';
import { translateTaskName, translateUnit, translateMaterialName } from '../../lib/translationMap';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { colors, fonts, fontSizes, fontWeights, spacing, radii } from '../../themes/designTokens';
import { Card, Button, InfoBanner, Checkbox, RadioGroup } from '../../themes/uiComponents';

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: `${spacing.xl}px ${spacing["2xl"]}px`,
  background: colors.bgInput,
  border: `1px solid ${colors.borderInput}`,
  borderRadius: radii.lg,
  color: colors.textSecondary,
  fontSize: fontSizes.md,
  fontFamily: fonts.body,
  outline: 'none',
};
const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: fontSizes.sm,
  fontWeight: fontWeights.medium,
  color: colors.textMuted,
  marginBottom: spacing.xs,
  fontFamily: fonts.body,
};

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface Material {
  name: string;
  amount: number;
  unit: string;
  price_per_unit: number | null;
  total_price: number | null;
  courseDetails?: {
    step: number;
    blocks: number;
    rows: number;
    material: string;
    mortarHeight: number;
    needsCutting?: boolean;
    armA_blocks?: number;
    armBL_blocks?: number;
    armBR_blocks?: number;
    calculationLog?: string[];
  }[];
}

interface MaterialOption {
  id: string;
  name: string;
  height: number; // cm
  width: number;  // cm (this becomes the height when laid flat)
  length: number; // cm
  isInches: boolean;
}

interface StepDimension {
  height: number;
  tread: number;
  isFirst: boolean;
  remainingTread: number;
  buriedDepth?: number;
  // U-shape specific
  armA_length: number;       // External length of arm A for this step
  armBL_length: number;      // External length of arm B left for this step
  armBR_length: number;      // External length of arm B right for this step
  armA_innerLength: number;  // Inner length of arm A (decreases per step)
  armB_innerLength: number;  // Inner length of arm B (same for both sides, decreases per step)
  isPlatform: boolean;       // Whether this is the last step (platform)
}

interface UShapeStairResult {
  totalSteps: number;
  totalArmALength: number;
  totalArmBLength: number;  // Same for both B sides
  materials: Material[];
  stepDimensions: StepDimension[];
  sideOverhang: number;
}

interface DiggingEquipment {
  id: string;
  name: string;
  'size (in tones)': number;
}

interface UShapeStairCalculatorProps {
  onResultsChange?: (results: any) => void;
  isInProjectCreating?: boolean;
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

// ─── Component ────────────────────────────────────────────────────────────────

const UShapeStairCalculator: React.FC<UShapeStairCalculatorProps> = ({
  onResultsChange,
  isInProjectCreating = false,
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
  const { user } = useAuthStore();
  const companyId = useAuthStore(state => state.getCompanyId());
  const { t } = useTranslation(['calculator', 'utilities', 'common', 'units']);

  // ─── Input State ──────────────────────────────────────────────────────────

  // Core measurements
  const [totalHeight, setTotalHeight] = useState<string>('');
  const [stepHeight, setStepHeight] = useState<string>('');
  const [stepTread, setStepTread] = useState<string>('');

  // U-shape specific: arm lengths
  const [armALength, setArmALength] = useState<string>('');  // Front side
  const [armBLength, setArmBLength] = useState<string>('');  // Both side arms (same length)

  // Slab/adhesive thickness (for block calculation - how much to subtract)
  const [slabThicknessTop, setSlabThicknessTop] = useState<string>('');
  const [slabThicknessFront, setSlabThicknessFront] = useState<string>('');
  const [overhangFront, setOverhangFront] = useState<string>('');

  // Task/transport state
  const [taskBreakdown, setTaskBreakdown] = useState<any[]>([]);
  const [calculateTransport, setCalculateTransport] = useState<boolean>(false);
  const [selectedTransportCarrier, setSelectedTransportCarrier] = useState<DiggingEquipment | null>(null);
  const [transportDistance, setTransportDistance] = useState<string>('30');

  const effectiveCalculateTransport = isInProjectCreating ? (propCalculateTransport ?? false) : calculateTransport;
  const effectiveSelectedTransportCarrier = isInProjectCreating ? (propSelectedTransportCarrier ?? null) : selectedTransportCarrier;
  const effectiveTransportDistance = isInProjectCreating && propTransportDistance ? propTransportDistance : transportDistance;

  const [carriersLocal, setCarriersLocal] = useState<DiggingEquipment[]>([]);

  const carriers = propCarriers && propCarriers.length > 0 ? propCarriers : carriersLocal;

  // Brick orientation (kept for calculations)
  const [brickOrientation, setBrickOrientation] = useState<'flat' | 'side'>('flat');

  // Step configuration
  const [stepConfig, setStepConfig] = useState<'frontsOnTop' | 'stepsToFronts'>('frontsOnTop');
  const [gapBetweenSlabs, setGapBetweenSlabs] = useState<number>(2);

  // Material selection
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>(['blocks4', 'blocks7']);

  // Results
  const [result, setResult] = useState<UShapeStairResult | null>(null);
  const [calculationError, setCalculationError] = useState<string | null>(null);

  // Slab section state (for UShapeStairsSlabs)
  const [slabType, setSlabType] = useState<string>('porcelain');
  const [cutsData, setCutsData] = useState<any>(null);
  const [slabsTransportHours, setSlabsTransportHours] = useState<number>(0);
  const [adhesiveMaterials, setAdhesiveMaterials] = useState<any[]>([]);
  const [installationTasks, setInstallationTasks] = useState<any[]>([]);
  const [adjustedStepHeightInfo, setAdjustedStepHeightInfo] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // ─── Material Options ─────────────────────────────────────────────────────

  const materialOptions: MaterialOption[] = [
    {
      id: 'blocks4',
      name: '4-inch Blocks',
      height: 21, // cm
      width: 10,  // cm (height when laid flat)
      length: 44, // cm
      isInches: true
    },
    {
      id: 'blocks7',
      name: '7-inch Blocks',
      height: 21, // cm
      width: 14,  // cm (height when laid flat)
      length: 44, // cm
      isInches: true
    },
    {
      id: 'bricks',
      name: 'Standard Bricks (9x6x21)',
      height: 6,  // cm
      width: 9,   // cm
      length: 21,  // cm
      isInches: false
    }
  ];

  const mortarRange = {
    min: 0.5,
    max: 3
  };
  const podsadzkaRange = { min: 1, max: 3 };

  const findMortarConfig = (totalSpaceForMortar: number, numberOfJoints: number): { podsadzka: number; jointSize: number } | null => {
    const minMortar = podsadzkaRange.min + numberOfJoints * mortarRange.min;
    const maxMortar = podsadzkaRange.max + numberOfJoints * mortarRange.max;
    if (totalSpaceForMortar < minMortar || totalSpaceForMortar > maxMortar) return null;
    // 1 rząd bloczków: tylko podsadzka, brak fug między blokami
    if (numberOfJoints === 0) {
      const p = Math.round(Math.max(podsadzkaRange.min, Math.min(podsadzkaRange.max, totalSpaceForMortar)) * 10) / 10;
      return { podsadzka: p, jointSize: 0 };
    }
    const toTry = [2, 1.5, 2.5, 1, 3, 1.2, 1.8, 2.2, 2.8];
    for (const p of toTry) {
      if (p < podsadzkaRange.min || p > podsadzkaRange.max) continue;
      const jointSize = numberOfJoints > 0 ? (totalSpaceForMortar - p) / numberOfJoints : 0;
      if (jointSize >= mortarRange.min && jointSize <= mortarRange.max) return { podsadzka: p, jointSize };
    }
    for (let p = podsadzkaRange.min; p <= podsadzkaRange.max; p += 0.1) {
      const jointSize = numberOfJoints > 0 ? (totalSpaceForMortar - p) / numberOfJoints : 0;
      if (jointSize >= mortarRange.min && jointSize <= mortarRange.max) return { podsadzka: Math.round(p * 10) / 10, jointSize };
    }
    return null;
  };

  // ─── Sync Props (for ProjectCreating integration) ─────────────────────────

  useEffect(() => {
    if (isInProjectCreating) {
      if (propCalculateTransport !== undefined) setCalculateTransport(propCalculateTransport);
      if (propSelectedTransportCarrier !== undefined) setSelectedTransportCarrier(propSelectedTransportCarrier);
      if (propTransportDistance !== undefined) setTransportDistance(propTransportDistance);
    }
  }, [isInProjectCreating, propCalculateTransport, propSelectedTransportCarrier, propTransportDistance]);

  // ─── Fetch Carriers ───────────────────────────────────────────────────────

  useEffect(() => {
    const fetchCarriers = async () => {
      try {
        const { data: carrierData, error: carrierError } = await supabase
          .from('setup_digging')
          .select('*')
          .eq('type', 'barrows_dumpers')
          .eq('company_id', companyId);

        if (carrierError) throw carrierError;
        setCarriersLocal(carrierData || []);
      } catch (error) {
        console.error('Error fetching carriers:', error);
      }
    };

    if (!isInProjectCreating && companyId) {
      fetchCarriers();
    }
  }, [isInProjectCreating, companyId]);

  // ─── Fetch Task Templates ────────────────────────────────────────────────

  const { data: taskTemplates = [] } = useQuery({
    queryKey: ['task_templates', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId)
        .order('name');

      if (error) {
        console.error('Error fetching task templates:', error);
        return [];
      }
      return data || [];
    },
    enabled: !!companyId
  });

  // Fetch mixing mortar task
  const { data: mixingMortarTask } = useQuery({
    queryKey: ['mixing_mortar_task', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId)
        .eq('name', 'mixing mortar')
        .single();
      if (error) {
        console.error('Error fetching mixing mortar task:', error);
        return null;
      }
      return data;
    },
    enabled: !!companyId
  });

  // Fetch all cutting tasks for this company
  const { data: cuttingTasks = [] } = useQuery({
    queryKey: ['cutting_tasks', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId)
        .like('name', '%cutting%');

      if (error) {
        console.error('Error fetching cutting tasks:', error);
        return [];
      }
      return data || [];
    },
    enabled: !!companyId
  });

  // ─── Scroll to Results ────────────────────────────────────────────────────

  useEffect(() => {
    if (result !== null && result.materials.length > 0 && resultsRef.current) {
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

  // ─── Material Toggle ─────────────────────────────────────────────────────

  const toggleMaterial = (materialId: string) => {
    setSelectedMaterials(prev => {
      if (prev.includes(materialId)) {
        return prev.filter(id => id !== materialId);
      } else {
        return [...prev, materialId];
      }
    });
  };

  // ─── Transport Helper ────────────────────────────────────────────────────

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

  const getCuttingTask = (dimension: number, slabMaterial: string, cutType: 'length' | 'width') => {
    const taskName = `cutting ${dimension}cm ${slabMaterial} slab`;
    return cuttingTasks.find((task: any) =>
      task.name.toLowerCase() === taskName.toLowerCase()
    );
  };

  // ─── Notify Parent of Results ─────────────────────────────────────────────

  useEffect(() => {
    if (result && result.materials.length > 0) {
      const taskBreakdownCalc: any[] = [];

      // Add building tasks for blocks/bricks
      result.materials.forEach(material => {
        let buildingTaskName = '';
        if (material.name.toLowerCase().includes('7-inch')) {
          buildingTaskName = 'building steps with 7-inch blocks';
        } else if (material.name.toLowerCase().includes('4-inch')) {
          buildingTaskName = 'building steps with 4-inch blocks';
        } else if (material.name.toLowerCase().includes('brick')) {
          buildingTaskName = 'building steps with bricks';
        }

        if (buildingTaskName && taskTemplates.length > 0) {
          const buildingTask = taskTemplates.find((t: any) =>
            t.name.toLowerCase() === buildingTaskName.toLowerCase()
          );

          if (buildingTask) {
            const totalHours = material.amount * (buildingTask.estimated_hours || 0);
            if (totalHours > 0) {
              taskBreakdownCalc.push({
                task: buildingTask.name,
                hours: totalHours,
                amount: material.amount,
                unit: buildingTask.unit || material.unit
              });
            }
          }
        }
      });

      // Add cutting tasks from cutsData
      if (slabType && cuttingTasks.length > 0 && cutsData) {
        if (cutsData.lengthCuts && cutsData.lengthCuts.length > 0) {
          cutsData.lengthCuts.forEach((cut: { dimension: number; count: number }) => {
            const cuttingTask = getCuttingTask(cut.dimension, slabType, 'length');
            if (cuttingTask) {
              taskBreakdownCalc.push({
                task: cuttingTask.name,
                hours: (cuttingTask.estimated_hours || 0) * cut.count,
                amount: cut.count,
                unit: cuttingTask.unit || 'piece'
              });
            }
          });
        }
        if (cutsData.widthCuts && cutsData.widthCuts.length > 0) {
          cutsData.widthCuts.forEach((cut: { dimension: number; count: number }) => {
            const cuttingTask = getCuttingTask(cut.dimension, slabType, 'width');
            if (cuttingTask) {
              taskBreakdownCalc.push({
                task: cuttingTask.name,
                hours: (cuttingTask.estimated_hours || 0) * cut.count,
                amount: cut.count,
                unit: cuttingTask.unit || 'piece'
              });
            }
          });
        }
      }

      // Add installation tasks
      if (installationTasks && installationTasks.length > 0) {
        installationTasks.forEach((task: any) => {
          taskBreakdownCalc.push(task);
        });
      }

      // Add slab transport
      if (effectiveCalculateTransport && slabsTransportHours > 0) {
        taskBreakdownCalc.push({
          task: 'transport slabs',
          hours: slabsTransportHours,
          amount: cutsData
            ? (cutsData.lengthCuts?.reduce((sum: number, c: { count: number }) => sum + c.count, 0) || 0) +
              (cutsData.widthCuts?.reduce((sum: number, c: { count: number }) => sum + c.count, 0) || 0)
            : 0,
          unit: 'pieces'
        });
      }

      // Add mixing mortar task
      if (mixingMortarTask && mixingMortarTask.estimated_hours !== undefined) {
        const mortarMaterial = result.materials.find(m => m.name.toLowerCase() === 'mortar');
        if (mortarMaterial && mortarMaterial.amount > 0) {
          const numberOfBatches = Math.ceil(mortarMaterial.amount / 125);
          taskBreakdownCalc.push({
            task: 'mixing mortar',
            hours: numberOfBatches * mixingMortarTask.estimated_hours,
            amount: numberOfBatches,
            unit: 'batch'
          });
        }
      }

      // Add transport for materials
      if (effectiveCalculateTransport && effectiveSelectedTransportCarrier) {
        const transportDistanceMeters = parseFloat(effectiveTransportDistance) || 30;
        const carrierSize = effectiveSelectedTransportCarrier["size (in tones)"] || 0.125;

        result.materials.forEach(material => {
          if (material.name.toLowerCase() === 'mortar') return;
          const materialType = material.name.toLowerCase().includes('brick') ? 'bricks' : 'blocks';
          const transportResult = calculateMaterialTransportTime(
            material.amount,
            carrierSize,
            materialType,
            transportDistanceMeters
          );

          if (transportResult.totalTransportTime > 0) {
            taskBreakdownCalc.push({
              task: `transport ${material.name.toLowerCase()}`,
              hours: transportResult.totalTransportTime,
              amount: material.amount,
              unit: material.unit
            });
          }
        });
      }

      setTaskBreakdown(taskBreakdownCalc);

      // Canvas dimensions: arm A (-front overhang) x arm B (-front overhang)
      const overhangFrontNum = parseFloat(overhangFront) || 0;
      const canvasWidthCm = (result.totalArmALength || 0) - overhangFrontNum;
      const canvasLengthCm = (result.totalArmBLength || 0) - overhangFrontNum;

      const formattedResults = {
        name: t('calculator:ushape_installation_name'),
        amount: result.totalSteps || 0,
        materials: result.materials.map(material => ({
          name: material.name,
          quantity: material.amount,
          unit: material.unit
        })),
        taskBreakdown: taskBreakdownCalc,
        canvasWidthCm,
        canvasLengthCm,
      };

      // Store results in data attribute
      const calculatorElement = document.querySelector('[data-calculator-results]');
      if (calculatorElement) {
        calculatorElement.setAttribute('data-results', JSON.stringify(formattedResults));
      }

      if (onResultsChange) {
        onResultsChange(formattedResults);
      }
    }
  }, [result, onResultsChange, slabType, cuttingTasks, cutsData, effectiveCalculateTransport, effectiveSelectedTransportCarrier, effectiveTransportDistance, slabsTransportHours, adhesiveMaterials, installationTasks, taskTemplates, mixingMortarTask, overhangFront]);

  // ─── MAIN CALCULATION ────────────────────────────────────────────────────

  const calculate = () => {
    setCalculationError(null);
    setAdjustedStepHeightInfo(null);

    // Validate required inputs
    if (!totalHeight || !stepHeight || !stepTread || !armALength || !armBLength ||
        !slabThicknessTop || !slabThicknessFront || !overhangFront) {
      setCalculationError(t('calculator:fill_required_measurements'));
      return;
    }

    if (selectedMaterials.length === 0) {
      setCalculationError(t('calculator:select_at_least_one_material'));
      return;
    }

    try {
      const totalHeightNum = parseFloat(totalHeight);
      const stepHeightInput = parseFloat(stepHeight);
      const stepTreadNum = parseFloat(stepTread);
      const armALengthNum = parseFloat(armALength);
      const armBLengthNum = parseFloat(armBLength);
      const slabThicknessTopNum = parseFloat(slabThicknessTop);
      const slabThicknessFrontNum = parseFloat(slabThicknessFront);
      const overhangFrontNum = parseFloat(overhangFront);

      // ── Step 1: Calculate number of steps ──────────────────────────────

      const rawStepCount = totalHeightNum / stepHeightInput;
      const stepCount = Math.round(rawStepCount);

      if (stepCount <= 0) {
        setCalculationError(t('calculator:invalid_step_count'));
        return;
      }

      // Calculate actual step height (may differ from input)
      const actualStepHeight = totalHeightNum / stepCount;

      if (Math.abs(actualStepHeight - stepHeightInput) > 0.01) {
        setAdjustedStepHeightInfo(
          t('calculator:ushape_step_height_adjusted', {
            from: stepHeightInput,
            to: actualStepHeight.toFixed(2),
            count: stepCount
          })
        );
      }

      // ── Step 2: Calculate tread reduction per step ─────────────────────
      const treadReduction = stepTreadNum - overhangFrontNum;

      // ── Step 3: Validate that stairs fit ───────────────────────────────
      // U-SHAPE KEY DIFFERENCE: Arm A shrinks from BOTH sides (B left + B right)
      // So arm A loses 2× treadReduction per step
      // Arm B loses 1× treadReduction per step (only from arm A side)

      let totalTreadConsumed = 0;
      for (let i = 0; i < stepCount; i++) {
        const isLast = i === stepCount - 1;
        let stepConsumption: number;
        if (isLast) {
          stepConsumption = treadReduction - slabThicknessFrontNum;
        } else {
          stepConsumption = treadReduction;
        }
        totalTreadConsumed += stepConsumption;
      }

      // Arm A: shrinks by 2× totalTreadConsumed (both B sides eat into it)
      const armA_innerAfterAllSteps = armALengthNum - (2 * totalTreadConsumed);
      // Arm B: shrinks by 1× totalTreadConsumed (only A eats into it)
      const armB_innerAfterAllSteps = armBLengthNum - totalTreadConsumed;

      if (armA_innerAfterAllSteps <= 0) {
        setCalculationError(
          t('calculator:ushape_arm_a_too_short', {
            length: armALengthNum,
            count: stepCount,
            required: (2 * totalTreadConsumed).toFixed(1)
          })
        );
        return;
      }

      if (armB_innerAfterAllSteps <= 0) {
        setCalculationError(
          t('calculator:ushape_arm_b_too_short', {
            length: armBLengthNum,
            count: stepCount,
            required: totalTreadConsumed.toFixed(1)
          })
        );
        return;
      }

      // ── Step 4: Calculate dimensions for each step ─────────────────────

      const stepDimensions: StepDimension[] = [];
      const materials: Material[] = [];

      let consumedTread = 0;

      for (let i = 0; i < stepCount; i++) {
        const isLast = i === stepCount - 1;

        let thisStepTread = treadReduction;
        if (isLast) {
          thisStepTread = treadReduction - slabThicknessFrontNum;
        }

        let thisTreadReduction: number;
        if (isLast) {
          thisTreadReduction = treadReduction - slabThicknessFrontNum;
        } else {
          thisTreadReduction = treadReduction;
        }

        // U-SHAPE: Arm A external shrinks by 2× consumed tread (both B sides)
        const armA_external = armALengthNum - (2 * consumedTread);
        // Arm B external same for both sides, shrinks by 1× consumed tread
        const armB_external = armBLengthNum - consumedTread;

        consumedTread += thisTreadReduction;

        // Target height for blocks (subtract slab thickness on top)
        const targetStepHeight = actualStepHeight * (i + 1) - slabThicknessTopNum;

        // Inner lengths after this step
        const armA_inner = armALengthNum - (2 * consumedTread);
        const armB_inner = armBLengthNum - consumedTread;

        stepDimensions.push({
          height: targetStepHeight,
          tread: thisStepTread,
          isFirst: i === 0,
          remainingTread: thisTreadReduction,
          armA_length: armA_external,
          armBL_length: armB_external,
          armBR_length: armB_external,  // Same as BL (symmetric)
          armA_innerLength: armA_inner,
          armB_innerLength: armB_inner,  // Same for both B sides
          isPlatform: isLast,
        });
      }

      // ── Step 5: Calculate blocks for each step ─────────────────────────

      const bestMaterialsForSteps: {
        step: number;
        materialId: string;
        blocks: number;
        rows: number;
        mortarHeight: number;
        needsCutting: boolean;
        buriedDepth?: number;
        podsadzka?: number;
        _log?: { targetStepHeight: number; totalBlockHeight: number; totalSpaceForMortar: number; numberOfJoints: number };
      }[] = [];

      // Find best buried depth (same logic as L-shape)
      let bestBuriedDepth = 2;
      let bestBuriedDepthDiff = Infinity;

      let needsBurying = false;
      for (const materialId of selectedMaterials) {
        const materialOption = materialOptions.find(m => m.id === materialId);
        if (!materialOption) continue;
        let blockHeightWhenFlat = materialOption.width;
        if (materialOption.id === 'bricks') {
          blockHeightWhenFlat = brickOrientation === 'flat' ? materialOption.height : materialOption.width;
        }
        const maxBlocksNeeded = Math.floor(actualStepHeight / blockHeightWhenFlat);
        const totalBlockHeight = maxBlocksNeeded * blockHeightWhenFlat;
        if (totalBlockHeight > actualStepHeight) {
          needsBurying = true;
          break;
        }
      }

      if (needsBurying) {
        for (let buriedDepth = 2; buriedDepth <= 8; buriedDepth++) {
          const blockAdjustedTotalHeight = totalHeightNum - buriedDepth;
          if (blockAdjustedTotalHeight <= 0) continue;
          const blockStepHeight = blockAdjustedTotalHeight / stepCount;

          let canBuildAll = true;
          for (let i = 0; i < stepCount; i++) {
            let found = false;
            for (const materialId of selectedMaterials) {
              const materialOption = materialOptions.find(m => m.id === materialId);
              if (!materialOption) continue;
              let blockHeightWhenFlat = materialOption.width;
              if (materialOption.id === 'bricks') {
                blockHeightWhenFlat = brickOrientation === 'flat' ? materialOption.height : materialOption.width;
              }
              const maxBlocksNeeded = Math.floor(blockStepHeight / (blockHeightWhenFlat + 1));
              for (let blocksNeeded = 1; blocksNeeded <= maxBlocksNeeded + 1; blocksNeeded++) {
                const totalBlockHeight = blocksNeeded * blockHeightWhenFlat;
                const numberOfJoints = blocksNeeded - 1;
                const heightWithStandardJoints = totalBlockHeight + 2 + (numberOfJoints * 1);
                const totalSpaceForMortar = blockStepHeight - totalBlockHeight;
                if (heightWithStandardJoints <= blockStepHeight &&
                    heightWithStandardJoints >= blockStepHeight - 0.5) {
                  found = true;
                  break;
                }
                if (findMortarConfig(totalSpaceForMortar, numberOfJoints)) {
                  found = true;
                  break;
                }
              }
              if (found) break;
            }
            if (!found) { canBuildAll = false; break; }
          }

          if (canBuildAll) {
            const diff = Math.abs(buriedDepth - 5);
            if (diff < bestBuriedDepthDiff) {
              bestBuriedDepth = buriedDepth;
              bestBuriedDepthDiff = diff;
            }
          }
        }
      } else {
        bestBuriedDepth = 2;
      }

      // Find best material configuration for each step
      for (let i = 0; i < stepCount; i++) {
        const targetStepHeight = actualStepHeight * (i + 1) - slabThicknessTopNum;
        let bestConfiguration: any = null;

        for (const materialId of selectedMaterials) {
          const materialOption = materialOptions.find(m => m.id === materialId);
          if (!materialOption) continue;

          let blockHeight = materialOption.width;
          if (materialOption.id === 'bricks') {
            blockHeight = brickOrientation === 'flat' ? materialOption.height : materialOption.width;
          }

          const maxBlocksNeeded = Math.ceil(targetStepHeight / blockHeight);

          for (let blocksNeeded = 1; blocksNeeded <= maxBlocksNeeded + 1; blocksNeeded++) {
            const totalBlockHeight = blocksNeeded * blockHeight;
            const numberOfJoints = blocksNeeded - 1;
            const totalSpaceForMortar = targetStepHeight - totalBlockHeight;
            const mortarConfig = findMortarConfig(totalSpaceForMortar, numberOfJoints);

            if (mortarConfig) {
              bestConfiguration = {
                materialId,
                blocks: blocksNeeded,
                mortarHeight: mortarConfig.jointSize,
                podsadzka: mortarConfig.podsadzka,
                needsCutting: false,
                buriedDepth: 0,
                _log: { targetStepHeight, totalBlockHeight, totalSpaceForMortar, numberOfJoints }
              };
              break;
            }

            const minMortar = podsadzkaRange.min + numberOfJoints * mortarRange.min;
            if (totalSpaceForMortar < minMortar) {
              const buriedDepth = minMortar - totalSpaceForMortar;
              if (buriedDepth <= 8) {
                bestConfiguration = {
                  materialId,
                  blocks: blocksNeeded,
                  mortarHeight: 1,
                  podsadzka: 2,
                  needsCutting: false,
                  buriedDepth,
                  _log: { targetStepHeight, totalBlockHeight, totalSpaceForMortar, numberOfJoints }
                };
                break;
              }
            }
          }
          if (bestConfiguration) break;
        }

        if (!bestConfiguration) {
          const mat = materialOptions.find(m => m.id === selectedMaterials[0]);
          const fbh = mat ? (mat.id === 'bricks' ? (brickOrientation === 'flat' ? mat.height : mat.width) : mat.width) : 10;
          const fb = Math.ceil(targetStepHeight / fbh);
          bestConfiguration = {
            materialId: selectedMaterials[0],
            blocks: fb,
            mortarHeight: 1,
            podsadzka: 2,
            needsCutting: true,
            buriedDepth: 0,
            _log: { targetStepHeight, totalBlockHeight: fb * fbh, totalSpaceForMortar: targetStepHeight - fb * fbh, numberOfJoints: fb - 1 }
          };
        }

        if (bestConfiguration.buriedDepth) {
          stepDimensions[i].buriedDepth = bestConfiguration.buriedDepth;
        }

        bestMaterialsForSteps.push({
          step: i + 1,
          materialId: bestConfiguration.materialId,
          blocks: bestConfiguration.blocks,
          rows: 0,
          mortarHeight: bestConfiguration.mortarHeight,
          podsadzka: bestConfiguration.podsadzka,
          needsCutting: bestConfiguration.needsCutting,
          buriedDepth: bestConfiguration.buriedDepth,
          _log: bestConfiguration._log
        });
      }

      // ── Step 6: Calculate actual block counts per step (U-shape) ───────

      const materialCounts: Record<string, {
        totalBlocks: number;
        courseDetails: {
          step: number;
          blocks: number;
          rows: number;
          material: string;
          mortarHeight: number;
          needsCutting: boolean;
          armA_blocks: number;
          armBL_blocks: number;
          armBR_blocks: number;
          calculationLog?: string[];
        }[];
      }> = {};

      selectedMaterials.forEach(materialId => {
        materialCounts[materialId] = { totalBlocks: 0, courseDetails: [] };
      });

      bestMaterialsForSteps.forEach((bestMaterial, index) => {
        const materialOption = materialOptions.find(m => m.id === bestMaterial.materialId);
        if (!materialOption) return;

        // Block dimensions when laid flat
        let blockHeight = materialOption.width;
        let blockWidth = materialOption.height;

        if (materialOption.id === 'bricks') {
          if (brickOrientation === 'flat') {
            blockHeight = materialOption.height;
            blockWidth = materialOption.width;
          } else {
            blockHeight = materialOption.width;
            blockWidth = materialOption.height;
          }
        }

        const blockLength = materialOption.length;
        const effectiveBlockLength = blockLength + 1; // +1cm for mortar joint

        const rowsOfBlocks = bestMaterial.blocks; // Number of block rows high

        const stepDim = stepDimensions[index];
        const armA_len = stepDim.armA_length;      // EXTERNAL length (blocks are built on the outside)
        const armB_len = stepDim.armBL_length;     // EXTERNAL length, same for both B sides

        // ── Calculate blocks for Arm A and both Arm B's ──
        // U-SHAPE BOND PATTERN:
        // Row 1 (odd): A full length, both B shorter by blockWidth (A covers corners)
        // Row 2 (even): Both B full length, A shorter by 2× blockWidth (B covers corners from both sides)
        // Row 3: same as row 1, etc.

        let armA_totalBlocks = 0;
        let armB_singleSideTotalBlocks = 0;

        for (let row = 1; row <= rowsOfBlocks; row++) {
          const isOddRow = row % 2 === 1;

          let armA_lengthThisRow: number;
          let armB_lengthThisRow: number;

          if (isOddRow) {
            // Row 1, 3, 5...: A full, B shorter by blockWidth
            armA_lengthThisRow = armA_len;
            armB_lengthThisRow = armB_len - blockWidth;
          } else {
            // Row 2, 4, 6...: B full, A shorter by 2× blockWidth (both corners)
            armA_lengthThisRow = armA_len - (2 * blockWidth);
            armB_lengthThisRow = armB_len;
          }

          const armA_blocksThisRow = Math.max(0, Math.ceil(armA_lengthThisRow / effectiveBlockLength));
          const armB_blocksThisRow = Math.max(0, Math.ceil(armB_lengthThisRow / effectiveBlockLength));

          armA_totalBlocks += armA_blocksThisRow;
          armB_singleSideTotalBlocks += armB_blocksThisRow;
        }

        // Both B sides are identical
        const armBL_totalBlocks = armB_singleSideTotalBlocks;
        const armBR_totalBlocks = armB_singleSideTotalBlocks;
        const stepBlocks = armA_totalBlocks + armBL_totalBlocks + armBR_totalBlocks;

        const log: string[] = bestMaterial._log ? [
          `--- Step ${bestMaterial.step} ---`,
          `Wysokość: targetStepHeight = ${bestMaterial._log.targetStepHeight.toFixed(2)} cm`,
          `Bloczki: ${bestMaterial.blocks} × ${blockHeight} cm = ${bestMaterial._log.totalBlockHeight.toFixed(2)} cm`,
          `Przestrzeń na fugi: ${bestMaterial._log.totalSpaceForMortar.toFixed(2)} cm`,
          `Podsadzka: ${bestMaterial.podsadzka?.toFixed(2) ?? '2.00'} cm, fuga: ${bestMaterial.mortarHeight.toFixed(2)} cm`,
          ...(bestMaterial.buriedDepth ? [`Zakopanie: ${bestMaterial.buriedDepth.toFixed(2)} cm`] : []),
          `Ramiona: A=${armA_len.toFixed(0)} cm, B(L)=B(R)=${armB_len.toFixed(0)} cm, eff.dł.=${effectiveBlockLength} cm`,
          `Bond U: nieparz. A pełne / B -${blockWidth}cm, parz. B pełne / A -${2 * blockWidth}cm`,
          ...Array.from({ length: rowsOfBlocks }, (_, r) => {
            const odd = (r + 1) % 2 === 1;
            const aLen = odd ? armA_len : Math.max(0, armA_len - 2 * blockWidth);
            const bLen = odd ? Math.max(0, armB_len - blockWidth) : armB_len;
            return `Rząd ${r + 1}: A=${aLen.toFixed(0)}→ceil(${(aLen / effectiveBlockLength).toFixed(2)}), B=${bLen.toFixed(0)}→ceil(${(bLen / effectiveBlockLength).toFixed(2)})×2`;
          }),
          `RAZEM: A=${armA_totalBlocks} + BL=${armBL_totalBlocks} + BR=${armBR_totalBlocks} = ${stepBlocks} bloczków`
        ] : [];

        materialCounts[bestMaterial.materialId].totalBlocks += stepBlocks;
        materialCounts[bestMaterial.materialId].courseDetails.push({
          step: bestMaterial.step,
          blocks: stepBlocks,
          rows: rowsOfBlocks,
          material: materialOption.name,
          mortarHeight: bestMaterial.mortarHeight,
          needsCutting: bestMaterial.needsCutting,
          armA_blocks: armA_totalBlocks,
          armBL_blocks: armBL_totalBlocks,
          armBR_blocks: armBR_totalBlocks,
          calculationLog: log
        });
      });

      // Create materials array
      Object.entries(materialCounts).forEach(([materialId, data]) => {
        if (data.totalBlocks > 0) {
          const materialOption = materialOptions.find(m => m.id === materialId);
          if (!materialOption) return;

          materials.push({
            name: materialOption.name,
            amount: data.totalBlocks,
            unit: 'pieces',
            price_per_unit: null,
            total_price: null,
            courseDetails: data.courseDetails
          });
        }
      });

      // ── Step 7: Calculate mortar (concrete fill) ───────────────────────

      const totalBlockCount = materials.reduce((sum, m) => sum + m.amount, 0);
      const mortarPerBlock = 0.5;
      let totalMortar = totalBlockCount * mortarPerBlock * 3;

      // Calculate U-shaped concrete fill for each step
      let totalFillVolumeCubicMeters = 0;

      const primaryMaterial = materialOptions.find(m => m.id === selectedMaterials[0]);
      const fillBlockWidth = primaryMaterial ? primaryMaterial.height : 21;

      stepDimensions.forEach((step, index) => {
        const fillDepth = stepTreadNum - fillBlockWidth; // cm

        if (fillDepth <= 0) return;

        const fillHeight = step.height; // cm

        // U-SHAPE FILL: arm A + 2× arm B - 2× corner (two corners instead of one)
        const armA_fillLength = step.armA_innerLength;
        const armB_fillLength = step.armB_innerLength; // Same for both sides

        const armA_volume = fillDepth * fillHeight * armA_fillLength; // cm³
        const armB_volume = fillDepth * fillHeight * armB_fillLength; // cm³ (one side)
        const cornerVolume = fillDepth * fillDepth * fillHeight; // cm³ (one corner)

        // U-shape: A + 2×B - 2×corner
        const stepFillVolume = armA_volume + (2 * armB_volume) - (2 * cornerVolume);

        totalFillVolumeCubicMeters += stepFillVolume / 1000000;
      });

      const mortarDensity = 1600; // kg/m³
      const additionalMortarKg = totalFillVolumeCubicMeters * mortarDensity;
      totalMortar += additionalMortarKg;

      materials.push({
        name: 'Mortar',
        amount: totalMortar,
        unit: 'kg',
        price_per_unit: null,
        total_price: null
      });

      // ── Step 8: Set result ─────────────────────────────────────────────

      setResult({
        totalSteps: stepCount,
        totalArmALength: armALengthNum,
        totalArmBLength: armBLengthNum,
        materials,
        stepDimensions,
        sideOverhang: 0,
      });

    } catch (error) {
      console.error('Calculation error:', error);
      setCalculationError(t('calculator:calculation_error'));
    }
  };

  // Recalculate when project settings (transport, equipment) change
  useEffect(() => {
    if (recalculateTrigger > 0 && isInProjectCreating) {
      calculate();
    }
  }, [recalculateTrigger]);

  // ─── RENDER ───────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xl }}>
      <InfoBanner>
        <strong>{t('calculator:important_information_label')}</strong> — {t('calculator:ushape_info_text')}
      </InfoBanner>

      <Card style={{ padding: spacing.xl }}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 items-start">

          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
            <h3 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.medium, color: colors.textPrimary, fontFamily: fonts.heading }}>{t('calculator:input_measurements_in_cm')}</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label style={labelStyle}>{t('calculator:input_total_height')}</label>
                <input type="number" value={totalHeight} onChange={(e) => setTotalHeight(e.target.value)} style={inputStyle} placeholder={t('calculator:placeholder_cm')} min="0" step="0.1" />
              </div>
              <div>
                <label style={labelStyle}>{t('calculator:input_step_height')}</label>
                <input type="number" value={stepHeight} onChange={(e) => setStepHeight(e.target.value)} style={inputStyle} placeholder={t('calculator:placeholder_cm')} min="0" step="0.1" />
              </div>
              <div>
                <label style={labelStyle}>{t('calculator:input_step_tread')}</label>
                <input type="number" value={stepTread} onChange={(e) => setStepTread(e.target.value)} style={inputStyle} placeholder={t('calculator:placeholder_cm')} min="0" step="0.1" />
              </div>
            </div>

            <h3 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.medium, color: colors.textPrimary, marginTop: spacing.lg, fontFamily: fonts.heading }}>{t('calculator:ushape_arm_lengths_title')}</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label style={labelStyle}>{t('calculator:ushape_arm_a_length')}</label>
                <input type="number" value={armALength} onChange={(e) => setArmALength(e.target.value)} style={inputStyle} placeholder={t('calculator:placeholder_cm')} min="0" step="0.1" />
              </div>
              <div>
                <label style={labelStyle}>{t('calculator:ushape_arm_b_length')}</label>
                <input type="number" value={armBLength} onChange={(e) => setArmBLength(e.target.value)} style={inputStyle} placeholder={t('calculator:placeholder_cm')} min="0" step="0.1" />
              </div>
            </div>

            <h3 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.medium, color: colors.textPrimary, marginTop: spacing.lg, fontFamily: fonts.heading }}>{t('calculator:input_slab_adhesive_thickness_cm')}</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label style={labelStyle}>{t('calculator:input_slab_top_of_step')}</label>
                <input type="number" value={slabThicknessTop} onChange={(e) => setSlabThicknessTop(e.target.value)} style={inputStyle} placeholder={t('calculator:placeholder_cm')} min="0" step="0.1" />
              </div>
              <div>
                <label style={labelStyle}>{t('calculator:input_slab_front_of_step')}</label>
                <input type="number" value={slabThicknessFront} onChange={(e) => setSlabThicknessFront(e.target.value)} style={inputStyle} placeholder={t('calculator:placeholder_cm')} min="0" step="0.1" />
              </div>
            </div>

            <h3 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.medium, color: colors.textPrimary, marginTop: spacing.lg, fontFamily: fonts.heading }}>{t('calculator:input_overhang_in_cm')}</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label style={labelStyle}>{t('calculator:input_overhang_front')}</label>
                <input type="number" value={overhangFront} onChange={(e) => setOverhangFront(e.target.value)} style={inputStyle} placeholder={t('calculator:placeholder_cm')} min="0" step="0.1" />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
            <h3 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.medium, color: colors.textPrimary, fontFamily: fonts.heading }}>{t('calculator:input_step_configuration')}</h3>

            <RadioGroup
              options={[
                { value: 'frontsOnTop', label: t('calculator:input_step_config_fronts_on_top') },
                { value: 'stepsToFronts', label: t('calculator:input_step_config_steps_to_fronts') },
              ]}
              value={stepConfig}
              onChange={(v) => setStepConfig(v as 'frontsOnTop' | 'stepsToFronts')}
              style={{ marginBottom: 0 }}
            />

            <div style={{ marginTop: spacing.lg }}>
              <label style={{ ...labelStyle, marginBottom: spacing.md }}>{t('calculator:gap_label')}</label>
              <div style={{ display: 'flex', gap: spacing.lg }}>
                {[2, 3, 4, 5].map((mm) => (
                  <label key={mm} onClick={() => setGapBetweenSlabs(mm)} style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, cursor: 'pointer', color: colors.textMuted, fontSize: fontSizes.sm, fontFamily: fonts.body }}>
                    <div style={{ width: 18, height: 18, borderRadius: radii.full, border: `2px solid ${gapBetweenSlabs === mm ? colors.accentBlue : colors.borderMedium}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {gapBetweenSlabs === mm && <div style={{ width: 8, height: 8, borderRadius: radii.full, background: colors.accentBlue }} />}
                    </div>
                    <span>{mm}mm</span>
                  </label>
                ))}
              </div>
            </div>

            <h3 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.medium, color: colors.textPrimary, marginTop: spacing.lg, fontFamily: fonts.heading }}>{t('calculator:input_material_selection')}</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
              {materialOptions.map(material => (
                <Checkbox
                  key={material.id}
                  label={material.id === 'blocks4' ? t('calculator:lshape_material_4inch') : material.id === 'blocks7' ? t('calculator:lshape_material_7inch') : t('calculator:lshape_material_bricks')}
                  checked={selectedMaterials.includes(material.id)}
                  onChange={() => toggleMaterial(material.id)}
                />
              ))}
            </div>

            {!isInProjectCreating && (
              <Checkbox
                label={t('calculator:input_calculate_transport_time')}
                checked={calculateTransport}
                onChange={setCalculateTransport}
              />
            )}

            {!isInProjectCreating && calculateTransport && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
                <label style={{ ...labelStyle, marginBottom: spacing.sm }}>{t('calculator:input_transport_carrier_optional')}</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
                  <div
                    onClick={() => setSelectedTransportCarrier(null)}
                    style={{
                      display: 'flex', alignItems: 'center', padding: spacing.md, cursor: 'pointer',
                      border: `2px dashed ${colors.borderInput}`, borderRadius: radii.lg,
                      background: selectedTransportCarrier === null ? colors.bgOverlay : 'transparent',
                    }}
                  >
                    <div style={{
                      width: 16, height: 16, borderRadius: radii.full, border: `2px solid ${colors.borderMedium}`, marginRight: spacing.md,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {selectedTransportCarrier === null && <div style={{ width: 8, height: 8, borderRadius: radii.full, background: colors.accentBlue }} />}
                    </div>
                    <span style={{ color: colors.textMuted, fontSize: fontSizes.sm }}>{t('calculator:default_wheelbarrow')}</span>
                  </div>
                  {carriers.length > 0 && carriers.map((carrier) => (
                    <div
                      key={carrier.id}
                      onClick={() => setSelectedTransportCarrier(carrier)}
                      style={{
                        display: 'flex', alignItems: 'center', padding: spacing.md, cursor: 'pointer',
                        background: selectedTransportCarrier?.id === carrier.id ? colors.bgOverlay : 'transparent',
                        borderRadius: radii.lg,
                      }}
                    >
                      <div style={{
                        width: 16, height: 16, borderRadius: radii.full, border: `2px solid ${colors.borderMedium}`, marginRight: spacing.md,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {selectedTransportCarrier?.id === carrier.id && <div style={{ width: 8, height: 8, borderRadius: radii.full, background: colors.accentBlue }} />}
                      </div>
                      <span style={{ color: colors.textMuted, fontSize: fontSizes.sm }}>{carrier.name}</span>
                      <span style={{ fontSize: fontSizes.sm, color: colors.textSubtle, marginLeft: spacing.md }}>{t('calculator:size_tons_format', { size: carrier["size (in tones)"] })}</span>
                    </div>
                  ))}
                </div>

                <div>
                  <label style={labelStyle}>{t('calculator:input_transport_distance_meters')}</label>
                  <input
                    type="number"
                    value={transportDistance}
                    onChange={(e) => setTransportDistance(e.target.value)}
                    style={inputStyle}
                    placeholder={t('calculator:placeholder_enter_transport_distance_meters')}
                    min="0"
                    step="1"
                  />
                </div>
              </div>
            )}

            <div style={{ marginTop: spacing.xl }}>
              <Button onClick={calculate} fullWidth>
                {t('calculator:calculate_button')}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {adjustedStepHeightInfo && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: spacing.md, padding: spacing.lg,
          background: `${colors.red}15`, border: `1px solid ${colors.red}40`,
          borderRadius: radii.xl, color: colors.textPrimary,
        }}>
          <AlertCircle style={{ width: 20, height: 20, color: colors.redLight, flexShrink: 0 }} />
          <p style={{ margin: 0, fontWeight: fontWeights.medium, fontFamily: fonts.body }}>{adjustedStepHeightInfo}</p>
        </div>
      )}

      {calculationError && (
        <div
          style={{
            display: 'flex', alignItems: 'flex-start', gap: spacing.md, padding: spacing.lg,
            background: `${colors.red}15`, border: `1px solid ${colors.red}40`,
            borderRadius: radii.xl, color: colors.textPrimary,
          }}
          data-calculator-error
        >
          <AlertCircle style={{ width: 20, height: 20, color: colors.redLight, flexShrink: 0 }} />
          <p style={{ margin: 0, fontWeight: fontWeights.medium, fontFamily: fonts.body }}>{calculationError}</p>
        </div>
      )}

      {result && (
        <div ref={resultsRef}>
        <Card>
          <h3 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.semibold, color: colors.textPrimary, marginBottom: spacing.lg, fontFamily: fonts.heading }}>
            {t('calculator:results_label')} - {t('calculator:ushape_results_title')}
          </h3>

          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xl }}>

              {result.stepDimensions.length > 0 && (
                <div style={{ background: `${colors.accentBlue}20`, color: colors.textPrimary, fontSize: fontSizes.sm, padding: spacing.sm, borderRadius: radii.lg, border: `1px solid ${colors.accentBlue}50` }}>
                  <p style={{ fontWeight: fontWeights.semibold, marginBottom: spacing.xs, margin: 0, fontFamily: fonts.body }}>{t('calculator:ushape_platform_info', { count: result.totalSteps })}</p>
                  <p style={{ margin: 0, fontFamily: fonts.body }}>{t('calculator:ushape_arm_a_remaining')} {result.stepDimensions[result.stepDimensions.length - 1].armA_innerLength.toFixed(1)}cm</p>
                  <p style={{ margin: 0, fontFamily: fonts.body }}>{t('calculator:ushape_arm_b_remaining')} {result.stepDimensions[result.stepDimensions.length - 1].armB_innerLength.toFixed(1)}cm ({t('calculator:ushape_both_sides')})</p>
                </div>
              )}

              <div style={{ width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm }}>
                  <h4 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.medium, color: colors.textPrimary, margin: 0, fontFamily: fonts.heading }}>{t('calculator:step_details')}</h4>
                  <div style={{ color: colors.red, fontSize: fontSizes.lg, fontWeight: fontWeights.bold }}>!</div>
                </div>
                <div style={{ background: `${colors.red}20`, color: colors.textPrimary, fontSize: fontSizes.sm, padding: spacing.sm, marginBottom: spacing.sm, borderRadius: radii.lg, border: `1px solid ${colors.red}50` }}>
                  <p style={{ fontWeight: fontWeights.semibold, marginBottom: spacing.md, margin: 0, fontFamily: fonts.body }}>{t('calculator:calculation_logic')}:</p>
                  <ul style={{ listStyle: 'disc', paddingLeft: spacing.xl, margin: 0, display: 'flex', flexDirection: 'column', gap: spacing.xs, fontFamily: fonts.body }}>
                    <li>{t('calculator:ushape_logic_step_ushaped')}</li>
                    <li>{t('calculator:ushape_logic_wall_behind')}</li>
                    <li>{t('calculator:ushape_logic_two_b_arms')}</li>
                    <li>{t('calculator:ushape_logic_bond_pattern')}</li>
                    <li>{t('calculator:ushape_logic_concrete_fill')}</li>
                  </ul>
                </div>

                <div style={{ overflowX: 'auto', border: `1px solid ${colors.borderDefault}`, borderRadius: radii["2xl"] }}>
                  <table style={{ width: '100%', backgroundColor: colors.bgCardInner }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${colors.borderDefault}`, background: colors.bgOverlay }}>
                        <th style={{ padding: `${spacing.md}px ${spacing.sm}px`, textAlign: 'left', fontSize: fontSizes.xs, color: colors.textPrimary }}>{t('calculator:lshape_table_step')}</th>
                        <th style={{ padding: `${spacing.md}px ${spacing.sm}px`, textAlign: 'left', fontSize: fontSizes.xs, color: colors.textPrimary }}>{t('calculator:lshape_table_height_cm')}</th>
                        <th style={{ padding: `${spacing.md}px ${spacing.sm}px`, textAlign: 'left', fontSize: fontSizes.xs, color: colors.textPrimary }}>{t('calculator:lshape_table_total_h_cm')}</th>
                        <th style={{ padding: `${spacing.md}px ${spacing.sm}px`, textAlign: 'left', fontSize: fontSizes.xs, color: colors.textPrimary }}>{t('calculator:ushape_arm_a_cm')}</th>
                        <th style={{ padding: `${spacing.md}px ${spacing.sm}px`, textAlign: 'left', fontSize: fontSizes.xs, color: colors.textPrimary }}>{t('calculator:ushape_arm_bl_cm')}</th>
                        <th style={{ padding: `${spacing.md}px ${spacing.sm}px`, textAlign: 'left', fontSize: fontSizes.xs, color: colors.textPrimary }}>{t('calculator:ushape_arm_br_cm')}</th>
                        <th style={{ padding: `${spacing.md}px ${spacing.sm}px`, textAlign: 'left', fontSize: fontSizes.xs, color: colors.textPrimary }}>{t('calculator:lshape_table_total_blocks')}</th>
                        <th style={{ padding: `${spacing.md}px ${spacing.sm}px`, textAlign: 'left', fontSize: fontSizes.xs, color: colors.textPrimary }}>{t('calculator:lshape_table_total_rows')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.stepDimensions.map((step, index) => {
                        const stepNumber = index + 1;
                        const stepCourseDetails = result.materials
                          .filter(m => m.courseDetails)
                          .flatMap(m => m.courseDetails || [])
                          .filter(c => c.step === stepNumber);

                        const buriedDepth = step.buriedDepth || 0;
                        const individualHeight = index === 0 ? step.height : step.height - result.stepDimensions[index - 1].height;

                        return (
                          <React.Fragment key={index}>
                          <tr style={{
                            background: index % 2 === 0 ? 'transparent' : colors.bgTableRowAlt,
                            borderTop: `1px solid ${colors.borderDefault}`
                          }}>
                            <td style={{ padding: `${spacing.md}px ${spacing.sm}px`, color: colors.textPrimary }}>
                              {stepNumber}
                              {step.isPlatform && <span style={{ fontSize: fontSizes.xs, color: colors.accentBlue, display: 'block' }}>{t('calculator:lshape_platform_label')}</span>}
                              {buriedDepth > 0 && (
                                <div style={{ fontSize: fontSizes.xs, color: colors.red }}>
                                  {t('calculator:lshape_buried_cm', { value: buriedDepth.toFixed(1) })}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: `${spacing.md}px ${spacing.sm}px`, color: colors.textPrimary }}>
                              {individualHeight.toFixed(2)}
                            </td>
                            <td style={{ padding: `${spacing.md}px ${spacing.sm}px`, color: colors.textPrimary }}>
                              {step.height.toFixed(2)}
                            </td>
                            <td style={{ padding: `${spacing.md}px ${spacing.sm}px`, color: colors.textPrimary }}>
                              {step.armA_length.toFixed(1)}
                            </td>
                            <td style={{ padding: `${spacing.md}px ${spacing.sm}px`, color: colors.textPrimary }}>
                              {step.armBL_length.toFixed(1)}
                            </td>
                            <td style={{ padding: `${spacing.md}px ${spacing.sm}px`, color: colors.textPrimary }}>
                              {step.armBR_length.toFixed(1)}
                            </td>
                            <td style={{ padding: `${spacing.md}px ${spacing.sm}px`, color: colors.textPrimary }}>
                              {stepCourseDetails.map((course, idx) => (
                                <div key={idx} style={{ color: course.needsCutting ? colors.amber : colors.textPrimary }}>
                                  {t('calculator:ushape_blocks_format', { total: course.blocks, a: course.armA_blocks || 0, bl: course.armBL_blocks || 0, br: course.armBR_blocks || 0 })}
                                  {course.needsCutting && " ✂️"}
                                </div>
                              ))}
                            </td>
                            <td style={{ padding: `${spacing.md}px ${spacing.sm}px`, color: colors.textPrimary }}>
                              {stepCourseDetails.map((course, idx) => (
                                <div key={idx}>{course.rows}</div>
                              ))}
                            </td>
                          </tr>
                        </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ width: '100%' }}>
                <h3 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.medium, color: colors.textPrimary, fontFamily: fonts.heading }}>
                  {t('calculator:total_labor_hours_label')}{' '}
                  <span style={{ color: colors.accentBlue }}>
                    {taskBreakdown && taskBreakdown.length > 0
                      ? taskBreakdown.reduce((sum: number, task: any) => sum + (task.hours || 0), 0).toFixed(2)
                      : '0.00'
                    } {t('calculator:hours_abbreviation')}
                  </span>
                </h3>

                <div style={{ marginTop: spacing.md }}>
                  <h4 style={{ fontWeight: fontWeights.medium, marginBottom: spacing.md, color: colors.textMuted, fontFamily: fonts.body }}>{t('calculator:task_breakdown_label')}</h4>
                  <ul style={{ paddingLeft: spacing.xl, listStyle: 'disc', margin: 0, display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                    {taskBreakdown && taskBreakdown.length > 0 ? (
                      taskBreakdown.map((task: any, index: number) => (
                        <li key={index} style={{ fontSize: fontSizes.sm, color: colors.textMuted, fontFamily: fonts.body }}>
                          <span style={{ fontWeight: fontWeights.medium }}>{translateTaskName(task.task, t)}</span> x {task.amount} {translateUnit(task.unit, t)} = {task.hours.toFixed(2)} {t('calculator:hours_label')}
                        </li>
                      ))
                    ) : (
                      <li style={{ fontSize: fontSizes.sm, color: colors.textSubtle }}>{t('calculator:no_tasks')}</li>
                    )}
                  </ul>
                </div>
              </div>

              <div style={{ width: '100%' }}>
                <h4 style={{ fontWeight: fontWeights.medium, marginBottom: spacing.md, color: colors.textPrimary, fontFamily: fonts.body }}>{t('calculator:total_materials_needed_label')}</h4>
                <div style={{ overflowX: 'auto', border: `1px solid ${colors.borderDefault}`, borderRadius: radii["2xl"] }}>
                  <table style={{ width: '100%', backgroundColor: colors.bgCardInner }}>
                    <thead style={{ borderBottom: `1px solid ${colors.borderDefault}`, background: colors.bgOverlay }}>
                      <tr>
                        <th scope="col" style={{ padding: `${spacing.sm}px ${spacing.lg}px`, textAlign: 'left', fontSize: fontSizes.xs, fontWeight: fontWeights.medium, color: colors.textPrimary }}>
                          {t('calculator:material_label')}
                        </th>
                        <th scope="col" style={{ padding: `${spacing.sm}px ${spacing.lg}px`, textAlign: 'left', fontSize: fontSizes.xs, fontWeight: fontWeights.medium, color: colors.textPrimary }}>
                          {t('calculator:quantity_label')}
                        </th>
                        <th scope="col" style={{ padding: `${spacing.sm}px ${spacing.lg}px`, textAlign: 'left', fontSize: fontSizes.xs, fontWeight: fontWeights.medium, color: colors.textPrimary }}>
                          {t('calculator:unit_label')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.materials.map((material, index) => (
                        <tr key={index} style={{
                          background: index % 2 === 0 ? 'transparent' : colors.bgTableRowAlt,
                          borderTop: `1px solid ${colors.borderDefault}`
                        }}>
                          <td style={{ padding: `${spacing.lg}px ${spacing.xl}px`, whiteSpace: 'nowrap', fontSize: fontSizes.sm, color: colors.textPrimary }}>
                            {translateMaterialName(material.name, t)}
                          </td>
                          <td style={{ padding: `${spacing.lg}px ${spacing.xl}px`, whiteSpace: 'nowrap', fontSize: fontSizes.sm, color: colors.textPrimary }}>
                            {material.amount.toFixed(2)}
                          </td>
                          <td style={{ padding: `${spacing.lg}px ${spacing.xl}px`, whiteSpace: 'nowrap', fontSize: fontSizes.sm, color: colors.textPrimary }}>
                            {translateUnit(material.unit, t)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </Card>
        </div>
      )}

      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
          <Card style={{ padding: spacing.xl }}>
            <h3 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.medium, color: colors.textPrimary, marginBottom: spacing.lg, fontFamily: fonts.heading }}>{t('calculator:slab_type')}</h3>
            <div>
              <label style={labelStyle}>{t('calculator:material_type_label')}</label>
              <select
                value={slabType}
                onChange={(e) => setSlabType(e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="porcelain">{t('calculator:porcelain')}</option>
                <option value="granite">{t('calculator:granite')}</option>
                <option value="sandstone">{t('calculator:sandstones')}</option>
                <option value="concrete">{t('calculator:concrete')}</option>
              </select>
            </div>
          </Card>
          <UShapeStairsSlabs
            stairResult={result}
            slabType={slabType}
            taskBreakdown={taskBreakdown}
            slabThicknessTop={parseFloat(slabThicknessTop) || 0}
            slabThicknessFront={parseFloat(slabThicknessFront) || 0}
            overhangFront={parseFloat(overhangFront) || 0}
            stepTread={parseFloat(stepTread) || 30}
            stepConfig={stepConfig}
            gapBetweenSlabs={gapBetweenSlabs}
            calculateTransport={effectiveCalculateTransport}
            selectedTransportCarrier={effectiveSelectedTransportCarrier}
            transportDistance={effectiveTransportDistance}
            taskTemplates={taskTemplates}
            onCutsCalculated={(cuts) => setCutsData(cuts)}
            onAdhesiveMaterialsCalculated={(materials) => setAdhesiveMaterials(materials)}
            onSlabsTransportCalculated={(hours) => setSlabsTransportHours(hours)}
            onInstallationTasksCalculated={(tasks) => setInstallationTasks(tasks)}
          />
        </div>
      )}
    </div>
  );
};

export default UShapeStairCalculator;