import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import UShapeStairsSlabs from './Ushapestairsslabs';
import { carrierSpeeds, getMaterialCapacity, DEFAULT_CARRIER_SPEED_M_PER_H } from '../../constants/materialCapacity';
import { translateTaskName, translateUnit, translateMaterialName } from '../../lib/translationMap';
import {
  splitTotalMortarKgToCementSand,
  totalMortarWeightKgForMixingFromMaterials,
  getStairTransportMaterialCapacityType,
} from '../../lib/mortarSplit';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { colors, fonts, fontSizes, fontWeights, spacing, radii } from '../../themes/designTokens';
import { Card, Button, InfoBanner, Checkbox, RadioGroup } from '../../themes/uiComponents';
import {
  computeBuriedDepthBand,
  computeGlobalBuriedDepthAndBestBlockStepHeight,
  computeSingleStepMaterialConfiguration,
  computeTotalLinearTreadConsumed,
  computeUShapeFrontFacePackageCm,
  computeUShapeMasonryArmLengthsCm,
  type StairMaterialOption,
} from './stairSharedCalculations';

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
  // U-shape specific — armA_length / armB* = geometric external (for slabs); *_masonry_* = block run lengths
  armA_length: number;       // Geometric external length of arm A (finished envelope) for this step
  armBL_length: number;      // Geometric external length of arm B left for this step
  armBR_length: number;      // Geometric external length of arm B right for this step
  armA_masonry_length: number;  // External masonry length: A − 2×(overhang + slab front + adhesive)
  armBL_masonry_length: number; // Each B − 1× face package
  armBR_masonry_length: number;
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
  deepBurialWarning?: string;
  /** Extra cm on first-step vertical front only: max(0, |start muru| − 0.5) vs finished level */
  firstStepFrontMasonryExtensionCm?: number;
  userTargetBuriedCm?: number;
  globalBuriedDepthCmUsed?: number;
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
  const [masonryStartVsFinishedCm, setMasonryStartVsFinishedCm] = useState<string>('');

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
  const [lastStepMode, setLastStepMode] = useState<'standard' | 'frontOnly'>('standard');
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
      name: '6-inch Blocks',
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

  const { data: brickBlockMortarMixRatioConfig } = useQuery<{ id: string; mortar_mix_ratio: string } | null>({
    queryKey: ['mortarMixRatio', 'brick', companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from('mortar_mix_ratios')
        .select('id, mortar_mix_ratio')
        .eq('company_id', companyId)
        .eq('type', 'brick')
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    enabled: !!companyId
  });

  const { data: wallMaterialUsageConfig } = useQuery<{ material_id: string }[]>({
    queryKey: ['materialUsageConfig', 'wall', 'stairs', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('material_usage_configs')
        .select('material_id')
        .eq('calculator_id', 'wall')
        .eq('company_id', companyId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId
  });

  const wallSandMaterialId = wallMaterialUsageConfig?.[0]?.material_id;

  const { data: selectedSandMaterial } = useQuery<{
    id: string;
    name: string;
    unit: string;
    price: number | null;
  } | null>({
    queryKey: ['material', 'sand_stairs', wallSandMaterialId],
    queryFn: async () => {
      if (!wallSandMaterialId) return null;
      const { data, error } = await supabase
        .from('materials')
        .select('id, name, unit, price')
        .eq('id', wallSandMaterialId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId && !!wallSandMaterialId
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
    const carrierSpeed = carrierSpeedData?.speed || DEFAULT_CARRIER_SPEED_M_PER_H;
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
        if (material.unit !== 'pieces') return;
        let buildingTaskName = '';
        const mn = material.name.toLowerCase();
        if (mn.includes('6-inch') || mn.includes('7-inch')) {
          buildingTaskName = 'building steps with 6-inch blocks';
        } else if (mn.includes('4-inch')) {
          buildingTaskName = 'building steps with 4-inch blocks';
        } else if (mn.includes('brick')) {
          buildingTaskName = 'building steps with bricks';
        }

        if (buildingTaskName && taskTemplates.length > 0) {
          const buildingTask = taskTemplates.find((t: any) => {
            const tn = t.name.toLowerCase();
            if (buildingTaskName === 'building steps with 6-inch blocks') {
              return tn === 'building steps with 6-inch blocks' || tn === 'building steps with 7-inch blocks';
            }
            return tn === buildingTaskName.toLowerCase();
          });

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
        const totalMortarWeightKg = totalMortarWeightKgForMixingFromMaterials(result.materials);
        if (totalMortarWeightKg > 0) {
          const numberOfBatches = Math.ceil(totalMortarWeightKg / 125);
          taskBreakdownCalc.push({
            task: 'mixing mortar',
            hours: numberOfBatches * mixingMortarTask.estimated_hours,
            amount: numberOfBatches,
            unit: 'batch'
          });
        }
      }

      // Add transport for materials (default wheelbarrow = 0.125 t when no carrier selected)
      if (effectiveCalculateTransport) {
        const transportDistanceMeters = parseFloat(effectiveTransportDistance) || 30;
        const carrierSize = effectiveSelectedTransportCarrier?.['size (in tones)'] ?? 0.125;

        result.materials.forEach(material => {
          const capacityType = getStairTransportMaterialCapacityType(material);
          if (!capacityType) return;
          const transportResult = calculateMaterialTransportTime(
            material.amount,
            carrierSize,
            capacityType,
            transportDistanceMeters
          );

          if (transportResult.totalTransportTime > 0) {
            const task =
              capacityType === 'cement'
                ? 'transport cement'
                : capacityType === 'sand'
                  ? 'transport sand'
                  : `transport ${material.name.toLowerCase()}`;
            taskBreakdownCalc.push({
              task,
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
  }, [result, onResultsChange, slabType, cuttingTasks, cutsData, effectiveCalculateTransport, effectiveSelectedTransportCarrier, effectiveTransportDistance, slabsTransportHours, adhesiveMaterials, installationTasks, taskTemplates, mixingMortarTask, overhangFront, selectedSandMaterial]);

  // ─── MAIN CALCULATION ────────────────────────────────────────────────────

  const calculate = () => {
    setCalculationError(null);
    setAdjustedStepHeightInfo(null);

    // Validate required inputs
    if (!totalHeight || !stepHeight || !stepTread || !masonryStartVsFinishedCm.trim() || !armALength || !armBLength ||
        !slabThicknessTop || !slabThicknessFront || !overhangFront) {
      setCalculationError(t('calculator:fill_required_measurements'));
      return;
    }

    if (selectedMaterials.length === 0) {
      setCalculationError(t('calculator:select_at_least_one_material'));
      return;
    }

    try {
      const masonryStartRaw = parseFloat(masonryStartVsFinishedCm.trim());
      if (Number.isNaN(masonryStartRaw) || masonryStartRaw > 0) {
        setCalculationError(t('calculator:stair_masonry_start_invalid'));
        return;
      }
      const targetBuriedCm = -masonryStartRaw;

      const totalHeightNum = parseFloat(totalHeight);
      const stepHeightInput = parseFloat(stepHeight);
      const stepTreadNum = parseFloat(stepTread);
      const armALengthNum = parseFloat(armALength);
      const armBLengthNum = parseFloat(armBLength);
      const slabThicknessTopNum = parseFloat(slabThicknessTop);
      const slabThicknessFrontNum = parseFloat(slabThicknessFront);
      const overhangFrontNum = parseFloat(overhangFront);
      const facePackageCm = computeUShapeFrontFacePackageCm({
        overhangFrontCm: overhangFrontNum,
        slabThicknessFrontCm: slabThicknessFrontNum,
      });

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

      const totalTreadConsumed = computeTotalLinearTreadConsumed(
        stepCount,
        treadReduction,
        slabThicknessFrontNum
      );

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

      const { minBuriedDepthCm, maxBuriedDepthCm } = computeBuriedDepthBand(targetBuriedCm);
      const { globalBuriedDepthCm, bestBlockStepHeight } = computeGlobalBuriedDepthAndBestBlockStepHeight({
        totalHeightNum,
        stepCount,
        actualStepHeight,
        targetBuriedCm,
        selectedMaterials,
        materialOptions: materialOptions as StairMaterialOption[],
        brickOrientation,
        slabThicknessTopCm: slabThicknessTopNum,
      });

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

        const { armA_masonryCm, armB_masonryCm } = computeUShapeMasonryArmLengthsCm({
          armA_externalCm: armA_external,
          armB_externalCm: armB_external,
          facePackageCm,
        });

        consumedTread += thisTreadReduction;

        const targetStepHeight =
          bestBlockStepHeight * (i + 1) - slabThicknessTopNum + globalBuriedDepthCm;

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
          armA_masonry_length: armA_masonryCm,
          armBL_masonry_length: armB_masonryCm,
          armBR_masonry_length: armB_masonryCm,
          armA_innerLength: armA_inner,
          armB_innerLength: armB_inner,  // Same for both B sides
          isPlatform: isLast,
        });
      }

      for (const s of stepDimensions) {
        if (s.armA_masonry_length <= 0 || s.armBL_masonry_length <= 0) {
          setCalculationError(
            t('calculator:ushape_masonry_arm_too_short', { package: facePackageCm.toFixed(1) })
          );
          return;
        }
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
        podsadzka: number;
        _log?: { targetStepHeight: number; totalBlockHeight: number; totalSpaceForMortar: number; numberOfJoints: number };
      }[] = [];

      for (let i = 0; i < stepCount; i++) {
        const targetStepHeight = stepDimensions[i].height;
        const stepMat = computeSingleStepMaterialConfiguration({
          targetStepHeight,
          selectedMaterials,
          materialOptions: materialOptions as StairMaterialOption[],
          brickOrientation,
          minBuriedDepthCm,
          maxBuriedDepthCm,
          globalBuriedDepthCm,
        });
        stepDimensions[i].buriedDepth = stepMat.totalDepthBelowFinishedCm;

        bestMaterialsForSteps.push({
          step: i + 1,
          materialId: stepMat.materialId,
          blocks: stepMat.blocks,
          rows: 0,
          mortarHeight: stepMat.mortarHeight,
          podsadzka: stepMat.podsadzka,
          needsCutting: stepMat.needsCutting,
          buriedDepth: stepMat.totalDepthBelowFinishedCm,
          _log: stepMat._log,
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
        const armA_len = stepDim.armA_masonry_length;  // External masonry run length (face package subtracted)
        const armB_len = stepDim.armBL_masonry_length;

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
          ...(bestMaterial.buriedDepth ? [t('calculator:burial_depth_cm_vs_finished', { value: bestMaterial.buriedDepth.toFixed(2) })] : []),
          `Ramiona (mur zewn.): A=${armA_len.toFixed(0)} cm, B(L)=B(R)=${armB_len.toFixed(0)} cm, eff.dł.=${effectiveBlockLength} cm`,
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

        const fillHeight = Math.max(0, step.height - globalBuriedDepthCm);

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

      const mortarMixRatio = brickBlockMortarMixRatioConfig?.mortar_mix_ratio || '1:4';
      const { cementBags, sandTonnes } = splitTotalMortarKgToCementSand(totalMortar, mortarMixRatio);
      materials.push(
        {
          name: 'Cement',
          amount: cementBags,
          unit: 'bags',
          price_per_unit: null,
          total_price: null
        },
        {
          name: selectedSandMaterial?.name || 'Sand',
          amount: Number(sandTonnes.toFixed(2)),
          unit: 'tonnes',
          price_per_unit: selectedSandMaterial?.price ?? null,
          total_price: null
        }
      );

      // ── Step 8: Set result ─────────────────────────────────────────────

      const maxDepthUsed = Math.max(
        globalBuriedDepthCm,
        ...stepDimensions.map(s => s.buriedDepth ?? 0)
      );
      const deepBurialWarning =
        maxDepthUsed - targetBuriedCm >= 5 ? t('calculator:stair_deep_burial_warning') : undefined;
      const firstStepFrontMasonryExtensionCm = Math.max(0, -masonryStartRaw - 0.5);

      setResult({
        totalSteps: stepCount,
        totalArmALength: armALengthNum,
        totalArmBLength: armBLengthNum,
        materials,
        stepDimensions,
        sideOverhang: 0,
        deepBurialWarning,
        firstStepFrontMasonryExtensionCm,
        userTargetBuriedCm: targetBuriedCm,
        globalBuriedDepthCmUsed: globalBuriedDepthCm,
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
  }, [recalculateTrigger, brickBlockMortarMixRatioConfig, selectedSandMaterial]);

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

            <div style={{ marginTop: spacing.sm }}>
              <label style={labelStyle}>{t('calculator:input_stair_masonry_start_cm')}</label>
              <input
                type="number"
                value={masonryStartVsFinishedCm}
                onChange={(e) => setMasonryStartVsFinishedCm(e.target.value)}
                style={inputStyle}
                placeholder={t('calculator:placeholder_stair_masonry_start')}
                max={0}
                step="0.1"
              />
              <p style={{ fontSize: fontSizes.xs, color: colors.textMuted, marginTop: spacing.xs, marginBottom: 0, lineHeight: 1.45, fontFamily: fonts.body }}>
                {t('calculator:input_stair_masonry_start_hint')}
              </p>
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

            <h3 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.medium, color: colors.textPrimary, marginTop: spacing.lg, fontFamily: fonts.heading }}>{t('calculator:last_step_mode_label')}</h3>
            <RadioGroup
              options={[
                { value: 'standard', label: t('calculator:last_step_standard') },
                { value: 'frontOnly', label: t('calculator:last_step_front_only') },
              ]}
              value={lastStepMode}
              onChange={(v) => setLastStepMode(v as 'standard' | 'frontOnly')}
              style={{ marginBottom: 0 }}
            />
            <p style={{ fontSize: fontSizes.xs, color: colors.textMuted, marginTop: spacing.sm, marginBottom: 0, lineHeight: 1.45, fontFamily: fonts.body }}>
              {t('calculator:last_step_front_only_hint')}
            </p>

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
              <Button variant="primary" onClick={calculate} fullWidth>
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
                    <li>{t('calculator:stair_logic_masonry_from_buried', { depth: (result.userTargetBuriedCm ?? 0).toFixed(1) })}</li>
                  </ul>
                  {result.userTargetBuriedCm !== undefined &&
                    result.globalBuriedDepthCmUsed !== undefined &&
                    Math.abs(result.globalBuriedDepthCmUsed - result.userTargetBuriedCm) > 0.05 && (
                    <p style={{ marginTop: spacing.sm, marginBottom: 0, fontSize: fontSizes.xs, color: colors.amber, fontFamily: fonts.body }}>
                      {t('calculator:stair_buried_optimized_note', {
                        user: result.userTargetBuriedCm.toFixed(1),
                        used: result.globalBuriedDepthCmUsed.toFixed(1),
                      })}
                    </p>
                  )}
                </div>

                {result.deepBurialWarning && (
                  <div style={{
                    background: `${colors.amber}18`,
                    color: colors.textPrimary,
                    fontSize: fontSizes.sm,
                    padding: spacing.md,
                    marginBottom: spacing.sm,
                    borderRadius: radii.lg,
                    border: `1px solid ${colors.amber}55`,
                    fontFamily: fonts.body,
                    lineHeight: 1.5,
                  }}>
                    {result.deepBurialWarning}
                  </div>
                )}

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
                              <div style={{ fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 4, lineHeight: 1.35 }}>
                                {t('calculator:stair_total_height_from_finished_note', {
                                  value: (step.height - buriedDepth).toFixed(2),
                                })}
                              </div>
                            </td>
                            <td style={{ padding: `${spacing.md}px ${spacing.sm}px`, color: colors.textPrimary }}>
                              {step.armA_masonry_length.toFixed(1)}
                            </td>
                            <td style={{ padding: `${spacing.md}px ${spacing.sm}px`, color: colors.textPrimary }}>
                              {step.armBL_masonry_length.toFixed(1)}
                            </td>
                            <td style={{ padding: `${spacing.md}px ${spacing.sm}px`, color: colors.textPrimary }}>
                              {step.armBR_masonry_length.toFixed(1)}
                            </td>
                            <td style={{ padding: `${spacing.md}px ${spacing.sm}px`, color: colors.textPrimary }}>
                              {stepCourseDetails.map((course, idx) => (
                                <div key={idx} style={{ color: course.needsCutting ? colors.amber : colors.textPrimary }}>
                                  <div style={{ fontWeight: fontWeights.semibold, fontSize: fontSizes.sm, marginBottom: 2 }}>
                                    {translateMaterialName(course.material, t)}
                                  </div>
                                  <div>
                                    {t('calculator:ushape_blocks_format', { total: course.blocks, a: course.armA_blocks || 0, bl: course.armBL_blocks || 0, br: course.armBR_blocks || 0 })}
                                    {course.needsCutting && " ✂️"}
                                  </div>
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
            lastStepMode={lastStepMode}
          />
        </div>
      )}
    </div>
  );
};

export default UShapeStairCalculator;