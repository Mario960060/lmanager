import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import LShapeStairsSlabs from './LShapeStairsSlabs';
import { carrierSpeeds, getMaterialCapacity } from '../../constants/materialCapacity';
import { translateTaskName } from '../../lib/translationMap';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { useTheme, getCardWithShadowStyle, getButtonStyle, getTableHeaderStyle, getTableRowStyle } from '../../themes';

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
    armB_blocks?: number;
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
  // L-shape specific
  armA_length: number;      // External length of arm A for this step
  armB_length: number;      // External length of arm B for this step
  armA_innerLength: number;  // Inner length of arm A (decreases per step)
  armB_innerLength: number;  // Inner length of arm B (decreases per step)
  isPlatform: boolean;       // Whether this is the last step (platform)
}

interface LShapeStairResult {
  totalSteps: number;
  totalArmALength: number;
  totalArmBLength: number;
  materials: Material[];
  stepDimensions: StepDimension[];
  sideOverhang: number;
}

interface DiggingEquipment {
  id: string;
  name: string;
  'size (in tones)': number;
}

interface LShapeStairCalculatorProps {
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
}

// ─── Component ────────────────────────────────────────────────────────────────

const LShapeStairCalculator: React.FC<LShapeStairCalculatorProps> = ({
  onResultsChange,
  isInProjectCreating = false,
  calculateTransport: propCalculateTransport,
  setCalculateTransport: propSetCalculateTransport,
  selectedTransportCarrier: propSelectedTransportCarrier,
  setSelectedTransportCarrier: propSetSelectedTransportCarrier,
  transportDistance: propTransportDistance,
  setTransportDistance: propSetTransportDistance,
  carriers: propCarriers = [],
  selectedExcavator: propSelectedExcavator
}) => {
  const { user } = useAuthStore();
  const companyId = useAuthStore(state => state.getCompanyId());
  const { currentTheme } = useTheme();
  const { t } = useTranslation(['calculator', 'utilities', 'common']);

  // ─── Input State ──────────────────────────────────────────────────────────

  // Core measurements
  const [totalHeight, setTotalHeight] = useState<string>('');
  const [stepHeight, setStepHeight] = useState<string>('');
  const [stepTread, setStepTread] = useState<string>('');

  // L-shape specific: arm lengths
  const [armALength, setArmALength] = useState<string>('');
  const [armBLength, setArmBLength] = useState<string>('');

  // Slab/adhesive thickness (for block calculation - how much to subtract)
  const [slabThicknessTop, setSlabThicknessTop] = useState<string>('');
  const [slabThicknessFront, setSlabThicknessFront] = useState<string>('');
  const [overhangFront, setOverhangFront] = useState<string>('');

  // Task/transport state
  const [taskBreakdown, setTaskBreakdown] = useState<any[]>([]);
  const [calculateTransport, setCalculateTransport] = useState<boolean>(false);
  const [selectedTransportCarrier, setSelectedTransportCarrier] = useState<DiggingEquipment | null>(null);
  const [transportDistance, setTransportDistance] = useState<string>('30');
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
  const [result, setResult] = useState<LShapeStairResult | null>(null);
  const [calculationError, setCalculationError] = useState<string | null>(null);

  // Slab section state (for LShapeStairsSlabs)
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

  // ─── Sync Props (for ProjectCreating integration) ─────────────────────────

  useEffect(() => {
    if (isInProjectCreating) {
      if (propCalculateTransport !== undefined) setCalculateTransport(propCalculateTransport);
      if (propSelectedTransportCarrier !== undefined) setSelectedTransportCarrier(propSelectedTransportCarrier);
      if (propTransportDistance !== undefined) setTransportDistance(propTransportDistance);
    }
  }, [isInProjectCreating, propCalculateTransport, propSelectedTransportCarrier, propTransportDistance]);

  useEffect(() => {
    if (isInProjectCreating && propSetCalculateTransport) {
      propSetCalculateTransport(calculateTransport);
    }
  }, [calculateTransport, isInProjectCreating]);

  useEffect(() => {
    if (isInProjectCreating && propSetSelectedTransportCarrier) {
      propSetSelectedTransportCarrier(selectedTransportCarrier);
    }
  }, [selectedTransportCarrier, isInProjectCreating]);

  useEffect(() => {
    if (isInProjectCreating && propSetTransportDistance) {
      propSetTransportDistance(transportDistance);
    }
  }, [transportDistance, isInProjectCreating]);

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
      if (calculateTransport && slabsTransportHours > 0) {
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
      if (calculateTransport && selectedTransportCarrier) {
        const transportDistanceMeters = parseFloat(transportDistance) || 30;
        const carrierSize = selectedTransportCarrier["size (in tones)"] || 0.125;

        result.materials.forEach(material => {
          if (material.name.toLowerCase() === 'mortar') return; // Skip mortar transport
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

      const formattedResults = {
        name: t('calculator:lshape_installation_name'),
        amount: result.totalSteps || 0,
        materials: result.materials.map(material => ({
          name: material.name,
          quantity: material.amount,
          unit: material.unit
        })),
        taskBreakdown: taskBreakdownCalc
      };

      // Store results in data attribute
      const calculatorElement = document.querySelector('[data-calculator-results]');
      if (calculatorElement) {
        calculatorElement.setAttribute('data-results', JSON.stringify(formattedResults));
      }

      if (onResultsChange && cutsData) {
        onResultsChange(formattedResults);
      }
    }
  }, [result, onResultsChange, slabType, cuttingTasks, cutsData, calculateTransport, selectedTransportCarrier, transportDistance, slabsTransportHours, adhesiveMaterials, installationTasks, taskTemplates, mixingMortarTask]);

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
          t('calculator:lshape_step_height_adjusted', {
            from: stepHeightInput,
            to: actualStepHeight.toFixed(2),
            count: stepCount
          })
        );
      }

      // ── Step 2: Calculate tread reduction per step ─────────────────────
      // Each step reduces the inner arm length by this amount
      // This is the "depth" that each step takes from the arms
      // Same logic as standard stairs: stepTread - frontOverhang - slabThicknessFront
      const treadReduction = stepTreadNum - overhangFrontNum;

      // The last step tread is shorter by slabThicknessFront (same as standard stairs)

      // ── Step 3: Validate that stairs fit ───────────────────────────────
      // After all steps, the inner length of each arm must be > 0
      // The inner length decreases by treadReduction for each step
      // But the last step is the platform, so we need (stepCount) reductions

      // Inner arm A after N steps = armALength - sum of treads
      // Inner arm B after N steps = armBLength - sum of treads
      // But arm A and arm B share the corner, so the reduction applies to both

      // Calculate total tread consumed by all steps (same logic as standard stairs)
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

      // Check if arms are long enough
      // The arm length must accommodate all step treads
      // Arm A inner length after all steps
      const armA_innerAfterAllSteps = armALengthNum - totalTreadConsumed;
      const armB_innerAfterAllSteps = armBLengthNum - totalTreadConsumed;

      if (armA_innerAfterAllSteps <= 0) {
        setCalculationError(
          t('calculator:lshape_arm_a_too_short', {
            length: armALengthNum,
            count: stepCount,
            required: totalTreadConsumed.toFixed(1)
          })
        );
        return;
      }

      if (armB_innerAfterAllSteps <= 0) {
        setCalculationError(
          t('calculator:lshape_arm_b_too_short', {
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

      // Track consumed tread for inner dimension calculation
      let consumedTread = 0;

      for (let i = 0; i < stepCount; i++) {
        const isLast = i === stepCount - 1;

        // Calculate tread for this step
        let thisStepTread = treadReduction; // stepTread - overhangFront
        if (isLast) {
          // Last step: shorter by front slab thickness
          thisStepTread = treadReduction - slabThicknessFrontNum;
        }

        // Tread reduction for inner dimensions (same logic as standard stairs)
        let thisTreadReduction: number;
        if (isLast) {
          thisTreadReduction = treadReduction - slabThicknessFrontNum;
        } else {
          thisTreadReduction = treadReduction;
        }

        // External length = visible length from outside for THIS step
        // Step 0: full arm length (no steps below)
        // Step 1: armLength - one tread (step 0 below)
        // Step 2: armLength - two treads, etc.
        const armA_external = armALengthNum - consumedTread;
        const armB_external = armBLengthNum - consumedTread;

        consumedTread += thisTreadReduction;

        // Target height for blocks (subtract slab thickness on top)
        const targetStepHeight = actualStepHeight * (i + 1) - slabThicknessTopNum;

        // Inner lengths (what's left inside after this step, decreasing)
        const armA_inner = armALengthNum - consumedTread;
        const armB_inner = armBLengthNum - consumedTread;

        stepDimensions.push({
          height: targetStepHeight,
          tread: thisStepTread,
          isFirst: i === 0,
          remainingTread: thisTreadReduction,
          armA_length: armA_external,
          armB_length: armB_external,
          armA_innerLength: armA_inner,
          armB_innerLength: armB_inner,
          isPlatform: isLast,
        });
      }

      // ── Step 5: Calculate blocks for each step ─────────────────────────

      // Best material for each step (same logic as standard stairs)
      const bestMaterialsForSteps: {
        step: number;
        materialId: string;
        blocks: number;
        rows: number;
        mortarHeight: number;
        needsCutting: boolean;
        buriedDepth?: number;
      }[] = [];

      // Find best buried depth (same logic as standard stairs)
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
                if (heightWithStandardJoints <= blockStepHeight &&
                    heightWithStandardJoints >= blockStepHeight - 0.5) {
                  found = true;
                  break;
                }
                if (heightWithStandardJoints < blockStepHeight) {
                  const remainingSpace = blockStepHeight - totalBlockHeight - 2;
                  const neededJointSize = numberOfJoints > 0 ? remainingSpace / numberOfJoints : 0;
                  if (neededJointSize >= mortarRange.min && neededJointSize <= mortarRange.max) {
                    found = true;
                    break;
                  }
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
            const heightWithStandardJoints = totalBlockHeight + 2 + (numberOfJoints * 1);

            if (heightWithStandardJoints > targetStepHeight) {
              const buriedDepth = heightWithStandardJoints - targetStepHeight;
              if (buriedDepth <= 8) {
                bestConfiguration = {
                  materialId,
                  blocks: blocksNeeded,
                  mortarHeight: 1,
                  needsCutting: false,
                  buriedDepth
                };
                break;
              }
            }

            if (heightWithStandardJoints < targetStepHeight) {
              const remainingSpace = targetStepHeight - totalBlockHeight - 2;
              const neededJointSize = numberOfJoints > 0 ? remainingSpace / numberOfJoints : 0;
              if (neededJointSize >= mortarRange.min && neededJointSize <= mortarRange.max) {
                bestConfiguration = {
                  materialId,
                  blocks: blocksNeeded,
                  mortarHeight: neededJointSize,
                  needsCutting: false,
                  buriedDepth: 0
                };
                break;
              }
            }
          }
          if (bestConfiguration) break;
        }

        if (!bestConfiguration) {
          bestConfiguration = {
            materialId: selectedMaterials[0],
            blocks: Math.ceil(targetStepHeight / (materialOptions.find(m => m.id === selectedMaterials[0])?.width || 10)),
            mortarHeight: 1,
            needsCutting: true,
            buriedDepth: 0
          };
        }

        // Update step dimension with buried depth
        if (bestConfiguration.buriedDepth) {
          stepDimensions[i].buriedDepth = bestConfiguration.buriedDepth;
        }

        bestMaterialsForSteps.push({
          step: i + 1,
          materialId: bestConfiguration.materialId,
          blocks: bestConfiguration.blocks,
          rows: 0,
          mortarHeight: bestConfiguration.mortarHeight,
          needsCutting: bestConfiguration.needsCutting,
          buriedDepth: bestConfiguration.buriedDepth
        });
      }

      // ── Step 6: Calculate actual block counts per step (L-shape) ───────

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
          armB_blocks: number;
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

        // Use this step's inner length (each step has different size - step 1 largest, platform smallest)
        const stepDim = stepDimensions[index];
        const armA_len = stepDim.armA_innerLength;
        const armB_len = stepDim.armB_innerLength;

        // ── Calculate blocks for Arm A and Arm B ──
        // Blocks are perpendicular to walls - number of blocks along each arm = arm length / block length
        // Both arms use full length for every row (no alternating bond pattern)

        const armA_blocksPerRow = Math.ceil(armA_len / effectiveBlockLength);
        const armB_blocksPerRow = Math.ceil(armB_len / effectiveBlockLength);

        const armA_totalBlocks = armA_blocksPerRow * rowsOfBlocks;
        const armB_totalBlocks = armB_blocksPerRow * rowsOfBlocks;
        const stepBlocks = armA_totalBlocks + armB_totalBlocks;

        materialCounts[bestMaterial.materialId].totalBlocks += stepBlocks;
        materialCounts[bestMaterial.materialId].courseDetails.push({
          step: bestMaterial.step,
          blocks: stepBlocks,
          rows: rowsOfBlocks,
          material: materialOption.name,
          mortarHeight: bestMaterial.mortarHeight,
          needsCutting: bestMaterial.needsCutting,
          armA_blocks: armA_totalBlocks,
          armB_blocks: armB_totalBlocks,
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
      const mortarPerBlock = 0.5; // kg per block (joints)
      let totalMortar = totalBlockCount * mortarPerBlock * 3;

      // Calculate L-shaped concrete fill for each step
      // Each step is built from the ground up
      // The fill is: (stepTread - blockWidth) wide × arm length × height from ground
      let totalFillVolumeCubicMeters = 0;

      // Get block width for fill calculation
      const primaryMaterial = materialOptions.find(m => m.id === selectedMaterials[0]);
      const fillBlockWidth = primaryMaterial ? primaryMaterial.height : 21; // block width when laid flat

      stepDimensions.forEach((step, index) => {
        // Fill depth = stepTread - block width (the gap behind the front blocks)
        const fillDepth = stepTreadNum - fillBlockWidth; // cm

        if (fillDepth <= 0) return; // No fill needed if blocks fill the entire tread

        // Height from ground for this step
        const fillHeight = step.height; // cm

        // Arm A fill length = inner length of arm A at this step
        const armA_fillLength = step.armA_innerLength; // cm

        // Arm B fill length = inner length of arm B at this step
        const armB_fillLength = step.armB_innerLength; // cm

        // Volume for arm A fill
        const armA_volume = fillDepth * fillHeight * armA_fillLength; // cm³

        // Volume for arm B fill
        const armB_volume = fillDepth * fillHeight * armB_fillLength; // cm³

        // Corner fill (where both arms meet) - avoid double counting
        // The corner is fillDepth × fillDepth × fillHeight
        const cornerVolume = fillDepth * fillDepth * fillHeight; // cm³

        // Total L-shaped fill = arm A + arm B - corner (to avoid double counting)
        const stepFillVolume = armA_volume + armB_volume - cornerVolume;

        totalFillVolumeCubicMeters += stepFillVolume / 1000000; // Convert cm³ to m³
      });

      // Convert fill volume to weight
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
        sideOverhang: 0, // No side overhang for L-shape (walls on sides)
      });

    } catch (error) {
      console.error('Calculation error:', error);
      setCalculationError(t('calculator:calculation_error'));
    }
  };

  // ─── RENDER ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Info box */}
      <div className="bg-gray-100 p-4 rounded-lg relative">
        <h3 className="text-lg font-medium text-gray-800 mb-2">{t('calculator:important_information_label')}</h3>
        <p className="text-sm text-gray-700">
          {t('calculator:lshape_info_text')}
        </p>
      </div>

      {/* Input form */}
      <div className="bg-gray-800 p-6 rounded-lg">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Left column: Measurements */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-white">{t('calculator:input_measurements_in_cm')}</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  {t('calculator:input_total_height')}
                </label>
                <input
                  type="number"
                  value={totalHeight}
                  onChange={(e) => setTotalHeight(e.target.value)}
                  className="w-full p-2 border rounded"
                  placeholder={t('calculator:placeholder_cm')}
                  min="0"
                  step="0.1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  {t('calculator:input_step_height')}
                </label>
                <input
                  type="number"
                  value={stepHeight}
                  onChange={(e) => setStepHeight(e.target.value)}
                  className="w-full p-2 border rounded"
                  placeholder={t('calculator:placeholder_cm')}
                  min="0"
                  step="0.1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  {t('calculator:input_step_tread')}
                </label>
                <input
                  type="number"
                  value={stepTread}
                  onChange={(e) => setStepTread(e.target.value)}
                  className="w-full p-2 border rounded"
                  placeholder={t('calculator:placeholder_cm')}
                  min="0"
                  step="0.1"
                />
              </div>
            </div>

            <h3 className="text-lg font-medium text-white mt-4">{t('calculator:lshape_arm_lengths_title')}</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  {t('calculator:lshape_arm_a_length')}
                </label>
                <input
                  type="number"
                  value={armALength}
                  onChange={(e) => setArmALength(e.target.value)}
                  className="w-full p-2 border rounded"
                  placeholder={t('calculator:placeholder_cm')}
                  min="0"
                  step="0.1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  {t('calculator:lshape_arm_b_length')}
                </label>
                <input
                  type="number"
                  value={armBLength}
                  onChange={(e) => setArmBLength(e.target.value)}
                  className="w-full p-2 border rounded"
                  placeholder={t('calculator:placeholder_cm')}
                  min="0"
                  step="0.1"
                />
              </div>
            </div>

            <h3 className="text-lg font-medium text-white mt-4">{t('calculator:input_slab_adhesive_thickness_cm')}</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  {t('calculator:input_slab_top_of_step')}
                </label>
                <input
                  type="number"
                  value={slabThicknessTop}
                  onChange={(e) => setSlabThicknessTop(e.target.value)}
                  className="w-full p-2 border rounded"
                  placeholder={t('calculator:placeholder_cm')}
                  min="0"
                  step="0.1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  {t('calculator:input_slab_front_of_step')}
                </label>
                <input
                  type="number"
                  value={slabThicknessFront}
                  onChange={(e) => setSlabThicknessFront(e.target.value)}
                  className="w-full p-2 border rounded"
                  placeholder={t('calculator:placeholder_cm')}
                  min="0"
                  step="0.1"
                />
              </div>
            </div>

            <h3 className="text-lg font-medium text-white mt-4">{t('calculator:input_overhang_in_cm')}</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  {t('calculator:input_overhang_front')}
                </label>
                <input
                  type="number"
                  value={overhangFront}
                  onChange={(e) => setOverhangFront(e.target.value)}
                  className="w-full p-2 border rounded"
                  placeholder={t('calculator:placeholder_cm')}
                  min="0"
                  step="0.1"
                />
              </div>
            </div>
          </div>

          {/* Right column: Options */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-white">{t('calculator:input_step_configuration')}</h3>

            <div className="space-y-2">
              <div className="flex items-center">
                <input
                  type="radio"
                  id="lshape-frontsOnTop"
                  checked={stepConfig === 'frontsOnTop'}
                  onChange={() => setStepConfig('frontsOnTop')}
                  className="h-4 w-4 text-gray-600 rounded"
                />
                <label htmlFor="lshape-frontsOnTop" className="ml-2 text-sm text-gray-300">
                  {t('calculator:input_step_config_fronts_on_top')}
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="radio"
                  id="lshape-stepsToFronts"
                  checked={stepConfig === 'stepsToFronts'}
                  onChange={() => setStepConfig('stepsToFronts')}
                  className="h-4 w-4 text-gray-600 rounded"
                />
                <label htmlFor="lshape-stepsToFronts" className="ml-2 text-sm text-gray-300">
                  {t('calculator:input_step_config_steps_to_fronts')}
                </label>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">{t('calculator:gap_label')}</label>
              <div className="flex gap-3">
                {[2, 3, 4, 5].map((mm) => (
                  <label key={mm} className="flex items-center">
                    <input
                      type="radio"
                      name="lshape-gap"
                      checked={gapBetweenSlabs === mm}
                      onChange={() => setGapBetweenSlabs(mm)}
                      className="h-4 w-4 text-gray-600 rounded"
                    />
                    <span className="ml-1 text-sm text-gray-300">{mm}mm</span>
                  </label>
                ))}
              </div>
            </div>

            <h3 className="text-lg font-medium text-white mt-4">{t('calculator:input_material_selection')}</h3>

            <div className="space-y-2">
              {materialOptions.map(material => (
                <div key={material.id} className="flex items-center">
                  <input
                    type="checkbox"
                    id={`lshape-${material.id}`}
                    checked={selectedMaterials.includes(material.id)}
                    onChange={() => toggleMaterial(material.id)}
                    className="h-4 w-4 text-gray-600 rounded"
                  />
                  <label htmlFor={`lshape-${material.id}`} className="ml-2 text-sm text-gray-300">
                    {material.id === 'blocks4' ? t('calculator:lshape_material_4inch') : material.id === 'blocks7' ? t('calculator:lshape_material_7inch') : t('calculator:lshape_material_bricks')}
                  </label>
                </div>
              ))}
            </div>

            {/* Transport */}
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={calculateTransport}
                onChange={(e) => setCalculateTransport(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-300">{t('calculator:input_calculate_transport_time')}</span>
            </label>

            {calculateTransport && (
              <div className="space-y-4">
                <label className="block text-sm font-medium text-gray-300 mb-3">{t('calculator:input_transport_carrier_optional')}</label>
                <div className="space-y-2">
                  <div
                    className="flex items-center p-2 cursor-pointer border-2 border-dashed border-gray-300 rounded"
                    onClick={() => setSelectedTransportCarrier(null)}
                  >
                    <div className={`w-4 h-4 rounded-full border mr-2 border-gray-400`}>
                      <div className={`w-2 h-2 rounded-full m-0.5 ${
                        selectedTransportCarrier === null ? 'bg-gray-400' : 'bg-transparent'
                      }`}></div>
                    </div>
                    <span className="text-gray-300">{t('calculator:default_wheelbarrow')}</span>
                  </div>
                  {carriers.length > 0 && carriers.map((carrier) => (
                    <div
                      key={carrier.id}
                      className="flex items-center p-2 cursor-pointer"
                      onClick={() => setSelectedTransportCarrier(carrier)}
                    >
                      <div className={`w-4 h-4 rounded-full border mr-2 border-gray-400`}>
                        <div className={`w-2 h-2 rounded-full m-0.5 ${
                          selectedTransportCarrier?.id === carrier.id ? 'bg-gray-400' : 'bg-transparent'
                        }`}></div>
                      </div>
                      <span className="text-gray-300">{carrier.name}</span>
                      <span className="text-sm text-gray-500 ml-2">{t('calculator:size_tons_format', { size: carrier["size (in tones)"] })}</span>
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">{t('calculator:input_transport_distance_meters')}</label>
                  <input
                    type="number"
                    value={transportDistance}
                    onChange={(e) => setTransportDistance(e.target.value)}
                    className="w-full p-2 border rounded-md"
                    placeholder={t('calculator:placeholder_enter_transport_distance_meters')}
                    min="0"
                    step="1"
                  />
                </div>
              </div>
            )}

            {/* Calculate button */}
            <div className="mt-6">
              <button
                onClick={calculate}
                style={{
                  ...getButtonStyle(currentTheme, 'primary'),
                  width: '100%',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = currentTheme.colors.buttonPrimaryHover;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = currentTheme.colors.buttonPrimary;
                }}
              >
                {t('calculator:calculate_button')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Step height adjustment info */}
      {adjustedStepHeightInfo && (
        <div className="bg-yellow-50 p-4 rounded-lg flex items-start">
          <AlertCircle className="w-5 h-5 text-yellow-500 mr-2 mt-0.5" />
          <p className="text-yellow-700">{adjustedStepHeightInfo}</p>
        </div>
      )}

      {/* Error */}
      {calculationError && (
        <div className="bg-red-50 p-4 rounded-lg flex items-start">
          <AlertCircle className="w-5 h-5 text-red-500 mr-2 mt-0.5" />
          <p className="text-red-700">{calculationError}</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div ref={resultsRef} style={getCardWithShadowStyle(currentTheme)}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: '600', color: currentTheme.colors.textPrimary, marginBottom: '1rem' }}>
            {t('calculator:results_label')} - {t('calculator:lshape_results_title')}
          </h3>

          <div className="overflow-x-auto">
            <div className="flex flex-col gap-6">

              {/* Platform info */}
              {result.stepDimensions.length > 0 && (
                <div className="bg-blue-900 text-white text-sm rounded p-3 border border-blue-700">
                  <p className="font-semibold mb-1">{t('calculator:lshape_platform_info', { count: result.totalSteps })}</p>
                  <p>{t('calculator:lshape_arm_a_remaining')} {result.stepDimensions[result.stepDimensions.length - 1].armA_innerLength.toFixed(1)}cm</p>
                  <p>{t('calculator:lshape_arm_b_remaining')} {result.stepDimensions[result.stepDimensions.length - 1].armB_innerLength.toFixed(1)}cm</p>
                </div>
              )}

              {/* Calculation logic info */}
              <div className="w-full">
                <div className="flex items-center gap-2 mb-3">
                  <h4 className="text-lg font-medium text-white">{t('calculator:step_details')}</h4>
                  <div className="text-red-500 text-lg font-bold">!</div>
                </div>
                <div className="bg-red-900 text-white text-sm rounded p-3 mb-3 border border-red-700">
                  <p className="font-semibold mb-2">{t('calculator:calculation_logic')}:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>{t('calculator:lshape_logic_step_lshaped')}</li>
                    <li>{t('calculator:lshape_logic_no_side_overhangs')}</li>
                    <li>{t('calculator:lshape_logic_concrete_fill')}</li>
                  </ul>
                </div>

                {/* Step details table */}
                <div className="overflow-x-auto" style={{ border: `1px solid ${currentTheme.colors.border}`, borderRadius: currentTheme.effects.borderRadius.large }}>
                  <table className="w-full" style={{ backgroundColor: currentTheme.colors.bgSecondary }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${currentTheme.colors.border}`, ...getTableHeaderStyle(currentTheme) }}>
                        <th className="py-2 px-3 text-left text-xs" style={{ color: currentTheme.colors.textPrimary }}>{t('calculator:lshape_table_step')}</th>
                        <th className="py-2 px-3 text-left text-xs" style={{ color: currentTheme.colors.textPrimary }}>{t('calculator:lshape_table_height_cm')}</th>
                        <th className="py-2 px-3 text-left text-xs" style={{ color: currentTheme.colors.textPrimary }}>{t('calculator:lshape_table_total_h_cm')}</th>
                        <th className="py-2 px-3 text-left text-xs" style={{ color: currentTheme.colors.textPrimary }}>{t('calculator:lshape_table_arm_a_external_cm')}</th>
                        <th className="py-2 px-3 text-left text-xs" style={{ color: currentTheme.colors.textPrimary }}>{t('calculator:lshape_table_arm_b_external_cm')}</th>
                        <th className="py-2 px-3 text-left text-xs" style={{ color: currentTheme.colors.textPrimary }}>{t('calculator:lshape_table_total_blocks')}</th>
                        <th className="py-2 px-3 text-left text-xs" style={{ color: currentTheme.colors.textPrimary }}>{t('calculator:lshape_table_total_rows')}</th>
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
                          <tr key={index} style={{
                            ...getTableRowStyle(currentTheme, index % 2 === 0),
                            borderTop: `1px solid ${currentTheme.colors.border}`
                          }}>
                            <td className="py-2 px-3" style={{ color: currentTheme.colors.textPrimary }}>
                              {stepNumber}
                              {step.isPlatform && <span className="text-xs text-blue-400 block">{t('calculator:lshape_platform_label')}</span>}
                              {buriedDepth > 0 && (
                                <div style={{ fontSize: '0.7rem', color: currentTheme.colors.error }}>
                                  {t('calculator:lshape_buried_cm', { value: buriedDepth.toFixed(1) })}
                                </div>
                              )}
                            </td>
                            <td className="py-2 px-3" style={{ color: currentTheme.colors.textPrimary }}>
                              {individualHeight.toFixed(2)}
                            </td>
                            <td className="py-2 px-3" style={{ color: currentTheme.colors.textPrimary }}>
                              {step.height.toFixed(2)}
                            </td>
                            <td className="py-2 px-3" style={{ color: currentTheme.colors.textPrimary }}>
                              {step.armA_length.toFixed(1)}
                            </td>
                            <td className="py-2 px-3" style={{ color: currentTheme.colors.textPrimary }}>
                              {step.armB_length.toFixed(1)}
                            </td>
                            <td className="py-2 px-3" style={{ color: currentTheme.colors.textPrimary }}>
                              {stepCourseDetails.map((course, idx) => (
                                <div key={idx} className={course.needsCutting ? "text-yellow-400" : ""}>
                                  {course.blocks} ({course.armA_blocks || 0} + {course.armB_blocks || 0})
                                  {course.needsCutting && " ✂️"}
                                </div>
                              ))}
                            </td>
                            <td className="py-2 px-3" style={{ color: currentTheme.colors.textPrimary }}>
                              {stepCourseDetails.map((course, idx) => (
                                <div key={idx}>{course.rows}</div>
                              ))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Task breakdown */}
              <div className="w-full">
                <h3 className="text-lg font-medium">
                  {t('calculator:total_labor_hours_label')}{' '}
                  <span className="text-blue-600">
                    {taskBreakdown && taskBreakdown.length > 0
                      ? taskBreakdown.reduce((sum: number, task: any) => sum + (task.hours || 0), 0).toFixed(2)
                      : '0.00'
                    } {t('calculator:hours_abbreviation')}
                  </span>
                </h3>

                <div className="mt-2">
                  <h4 className="font-medium text-gray-700 mb-2">{t('calculator:task_breakdown_label')}</h4>
                  <ul className="space-y-1 pl-5 list-disc">
                    {taskBreakdown && taskBreakdown.length > 0 ? (
                      taskBreakdown.map((task: any, index: number) => (
                        <li key={index} className="text-sm">
                          <span className="font-medium">{translateTaskName(task.task, t)}</span> x {task.amount} {task.unit} = {task.hours.toFixed(2)} hours
                        </li>
                      ))
                    ) : (
                      <li className="text-sm text-gray-500">{t('calculator:no_tasks')}</li>
                    )}
                  </ul>
                </div>
              </div>

              {/* Materials table */}
              <div className="w-full">
                <h4 className="font-medium mb-2 text-white">{t('calculator:total_materials_needed_label')}</h4>
                <div className="overflow-x-auto" style={{ border: `1px solid ${currentTheme.colors.border}`, borderRadius: currentTheme.effects.borderRadius.large }}>
                  <table className="w-full" style={{ backgroundColor: currentTheme.colors.bgSecondary }}>
                    <thead style={{ borderBottom: `1px solid ${currentTheme.colors.border}`, ...getTableHeaderStyle(currentTheme) }}>
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: currentTheme.colors.textPrimary }}>
                          {t('calculator:material_label')}
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: currentTheme.colors.textPrimary }}>
                          {t('calculator:quantity_label')}
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: currentTheme.colors.textPrimary }}>
                          {t('calculator:unit_label')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.materials.map((material, index) => (
                        <tr key={index} style={{
                          ...getTableRowStyle(currentTheme, index % 2 === 0),
                          borderTop: `1px solid ${currentTheme.colors.border}`
                        }}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm" style={{ color: currentTheme.colors.textPrimary }}>
                            {material.name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm" style={{ color: currentTheme.colors.textPrimary }}>
                            {material.amount.toFixed(2)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm" style={{ color: currentTheme.colors.textPrimary }}>
                            {material.unit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="bg-gray-800 p-6 rounded-lg">
            <h3 className="text-lg font-medium text-white mb-4">{t('calculator:slab_type')}</h3>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {t('calculator:material_type_label')}
              </label>
              <select
                value={slabType}
                onChange={(e) => setSlabType(e.target.value)}
                className="w-full p-2 border rounded-md bg-gray-700 text-gray-300 border-gray-600"
              >
                <option value="porcelain">Porcelain</option>
                <option value="granite">Granite</option>
                <option value="sandstone">Sandstone</option>
                <option value="concrete">Concrete</option>
              </select>
            </div>
          </div>
          <LShapeStairsSlabs
            stairResult={result}
            slabType={slabType}
            taskBreakdown={taskBreakdown}
            slabThicknessTop={parseFloat(slabThicknessTop) || 0}
            slabThicknessFront={parseFloat(slabThicknessFront) || 0}
            overhangFront={parseFloat(overhangFront) || 0}
            stepTread={parseFloat(stepTread) || 30}
            stepConfig={stepConfig}
            gapBetweenSlabs={gapBetweenSlabs}
            calculateTransport={calculateTransport}
            selectedTransportCarrier={selectedTransportCarrier}
            transportDistance={transportDistance}
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

export default LShapeStairCalculator;
