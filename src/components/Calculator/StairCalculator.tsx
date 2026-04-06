import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import StandardStairsSlabs from './StandardStairsSlabs';
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
  computeStandardLinearTotalLength,
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
    podsadzka: number;
    needsCutting?: boolean;
    calculationLog?: string[];
  }[];
}

interface MaterialOption {
  id: string;
  name: string;
  height: number; // cm
  width: number; // cm
  length: number; // cm
  isInches: boolean;
}

interface StepDimension {
  height: number;
  tread: number;
  isFirst: boolean;
  remainingTread: number;
  buriedDepth?: number;  // Add burial depth for each step
}

interface StairResult {
  totalSteps: number;
  totalLength: number;
  materials: Material[];
  stepDimensions: StepDimension[];
  totalWidth?: number;
  sideOverhang: number;
  /** Shown above step table when burial is much deeper than masonry-start target */
  deepBurialWarning?: string;
  /** Extra cm on first-step vertical front only: max(0, |start muru| − 0.5) vs finished level */
  firstStepFrontMasonryExtensionCm?: number;
  /** User’s masonry-start depth (cm below finished), from input */
  userTargetBuriedCm?: number;
  /** Depth used after optional optimization (cm below finished) */
  globalBuriedDepthCmUsed?: number;
}

interface StairCalculatorProps {
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

interface DiggingEquipment {
  id: string;
  name: string;
  'size (in tones)': number;
}

const StairCalculator: React.FC<StairCalculatorProps> = ({ 
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
  const { t } = useTranslation(['calculator', 'utilities', 'common']);
  // Input measurements
  const [totalHeight, setTotalHeight] = useState<string>('');
  const [totalWidth, setTotalWidth] = useState<string>('');
  const [stepTread, setStepTread] = useState<string>('');
  const [stepHeight, setStepHeight] = useState<string>('');
  /** cm vs finished level: 0 or negative (e.g. -5 = first course ~5 cm below LL). Required — no default. */
  const [masonryStartVsFinishedCm, setMasonryStartVsFinishedCm] = useState<string>('');
  const [slabThicknessTop, setSlabThicknessTop] = useState<string>('');
  const [slabThicknessSide, setSlabThicknessSide] = useState<string>('');
  const [slabThicknessFront, setSlabThicknessFront] = useState<string>('');
  const [overhangFront, setOverhangFront] = useState<string>('');
  const [overhangSide, setOverhangSide] = useState<string>('');
  const [slabType, setSlabType] = useState<string>('porcelain');
  const [cutsData, setCutsData] = useState<{ lengthCuts: any[], widthCuts: any[] } | null>(null);
  const [taskBreakdown, setTaskBreakdown] = useState<any[]>([]);
  const [slabsTransportHours, setSlabsTransportHours] = useState<number>(0);
  const [adhesiveMaterials, setAdhesiveMaterials] = useState<any[]>([]);
  const [installationTasks, setInstallationTasks] = useState<any[]>([]);
  
  // Side options
  const [buildLeftSide, setBuildLeftSide] = useState<boolean>(true);
  const [buildRightSide, setBuildRightSide] = useState<boolean>(true);
  const [buildBackSide, setBuildBackSide] = useState<boolean>(false);
  const [calculateTransport, setCalculateTransport] = useState<boolean>(false);
  const [selectedTransportCarrier, setSelectedTransportCarrier] = useState<DiggingEquipment | null>(null);
  const [transportDistance, setTransportDistance] = useState<string>('30');
  const [carriersLocal, setCarriersLocal] = useState<DiggingEquipment[]>([]);

  // Use carriers from props if available (from ProjectCreating), otherwise use local state
  const carriers = propCarriers && propCarriers.length > 0 ? propCarriers : carriersLocal;

  const effectiveCalculateTransport = isInProjectCreating ? (propCalculateTransport ?? false) : calculateTransport;
  const effectiveSelectedTransportCarrier = isInProjectCreating ? (propSelectedTransportCarrier ?? null) : selectedTransportCarrier;
  const effectiveTransportDistance = isInProjectCreating && propTransportDistance ? propTransportDistance : transportDistance;

  // Fetch carriers from database when not in ProjectCreating mode
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
    
    // Only fetch if not in ProjectCreating mode (when propCarriers are provided)
    if (!isInProjectCreating && companyId) {
      fetchCarriers();
    }
  }, [isInProjectCreating, companyId]);
  
  // Brick orientation (kept for calculations but removed from UI)
  const [brickOrientation, setBrickOrientation] = useState<'flat' | 'side'>('flat');
  
  // Step configuration
  const [stepConfig, setStepConfig] = useState<'frontsOnTop' | 'stepsToFronts'>('frontsOnTop');
  const [lastStepMode, setLastStepMode] = useState<'standard' | 'frontOnly'>('standard');
  const [gapBetweenSlabs, setGapBetweenSlabs] = useState<number>(2);
  
  // Material selection - updated to allow multiple materials
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>(['blocks4', 'blocks7']);
  
  // Fetch cutting tasks for each slab type and dimension
  const cuttingTaskSizes = [30, 60, 90, 120];
  const slabTypes = ['porcelain', 'granite', 'sandstone', 'concrete'];
  
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

  // Fetch all task templates (for slab installation)
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
  
  // Material options
  const materialOptions: MaterialOption[] = [
    {
      id: 'blocks4',
      name: '4-inch Blocks',
      height: 21, // cm
      width: 10, // cm
      length: 44, // cm
      isInches: true
    },
    {
      id: 'blocks7',
      name: '6-inch Blocks',
      height: 21, // cm
      width: 14, // cm
      length: 44, // cm
      isInches: true
    },
    {
      id: 'bricks',
      name: 'Standard Bricks (9x6x21)',
      height: 6, // cm
      width: 9, // cm
      length: 21, // cm
      isInches: false
    }
  ];

  // Helper function to check if a cut is needed
  const needsCut = (actualDimension: number, requiredDimension: number): boolean => {
    return Math.abs(actualDimension - requiredDimension) > 0.1;
  };
  
  // Helper function to find cutting task from database
  const getCuttingTask = (dimension: number, slabMaterial: string, cutType: 'length' | 'width') => {
    const taskName = `cutting ${dimension}cm ${slabMaterial} slab`;
    const found = cuttingTasks.find(task => 
      task.name.toLowerCase() === taskName.toLowerCase()
    );
    return found;
  };
  
  // Results
  const [result, setResult] = useState<StairResult | null>(null);
  const [calculationError, setCalculationError] = useState<string | null>(null);
  const [adjustedStepHeightInfo, setAdjustedStepHeightInfo] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  
  // Add useEffect to notify parent of result changes
  useEffect(() => {
    if (result && result.materials.length > 0) {
      // Calculate task breakdown for cutting tasks
      const taskBreakdown = [];
      
      // Add building tasks for blocks/bricks
      result.materials.forEach(material => {
        if (material.unit !== 'pieces') return;
        // Find matching "building steps with X" task
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
              taskBreakdown.push({
                task: buildingTask.name,
                hours: totalHours,
                amount: material.amount,
                unit: buildingTask.unit || material.unit
              });
            }
          }
        }
      });
      
      // Add cutting tasks based on slabType and actual cuts data
      if (slabType && cuttingTasks.length > 0 && cutsData) {
        // Process length cuts
        if (cutsData.lengthCuts && cutsData.lengthCuts.length > 0) {
          cutsData.lengthCuts.forEach(cut => {
            const cuttingTask = getCuttingTask(cut.dimension, slabType, 'length');
            if (cuttingTask) {
              taskBreakdown.push({
                task: cuttingTask.name,
                hours: (cuttingTask.estimated_hours || 0) * cut.count,
                amount: cut.count,
                unit: cuttingTask.unit || 'piece'
              });
            }
          });
        }
        
        // Process width cuts
        if (cutsData.widthCuts && cutsData.widthCuts.length > 0) {
          cutsData.widthCuts.forEach(cut => {
            const cuttingTask = getCuttingTask(cut.dimension, slabType, 'width');
            if (cuttingTask) {
              taskBreakdown.push({
                task: cuttingTask.name,
                hours: (cuttingTask.estimated_hours || 0) * cut.count,
                amount: cut.count,
                unit: cuttingTask.unit || 'piece'
              });
            }
          });
        }
      }
      
      // Add installation tasks for slabs (finishing)
      if (installationTasks && installationTasks.length > 0) {
        installationTasks.forEach(task => {
          taskBreakdown.push(task);
        });
      }
      
      // Add transport for slabs if calculateTransport is enabled and we have slabs transport hours
      if (effectiveCalculateTransport && slabsTransportHours > 0) {
        taskBreakdown.push({
          task: 'transport slabs',
          hours: slabsTransportHours,
          amount: cutsData ? (cutsData.lengthCuts?.reduce((sum, c) => sum + c.count, 0) || 0) + (cutsData.widthCuts?.reduce((sum, c) => sum + c.count, 0) || 0) : 0,
          unit: 'pieces'
        });
      }
      
      // Add adhesive materials to task breakdown (treating as material line items, not hours)
      // For now we'll add them as info items
      // This will be displayed separately in materials section
      
      // Add mixing mortar task if available
      if (mixingMortarTask && mixingMortarTask.estimated_hours !== undefined) {
        const totalMortarWeightKg = totalMortarWeightKgForMixingFromMaterials(result.materials);
        if (totalMortarWeightKg > 0) {
          const numberOfBatches = Math.ceil(totalMortarWeightKg / 125);
          taskBreakdown.push({
            task: 'mixing mortar',
            hours: numberOfBatches * mixingMortarTask.estimated_hours,
            amount: numberOfBatches,
            unit: 'batch'
          });
        }
      }
      
      // Add transport for materials if calculateTransport is enabled (default wheelbarrow = 0.125 t, same as WallCalculator)
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
            taskBreakdown.push({
              task,
              hours: transportResult.totalTransportTime,
              amount: material.amount,
              unit: material.unit
            });
          }
        });
      }
      
      // Canvas dimensions: width = totalWidth - side overhangs, length = totalLength + front slab + adhesive
      const sideOverhangTotal = (buildLeftSide ? (result.sideOverhang || 0) : 0) + (buildRightSide ? (result.sideOverhang || 0) : 0);
      const canvasWidthCm = (result.totalWidth || 0) - sideOverhangTotal;
      const adhesiveCm = 1; // default adhesive thickness
      const canvasLengthCm = (result.totalLength || 0) + (parseFloat(slabThicknessFront) || 0) + adhesiveCm;

      const formattedResults = {
        name: 'Stair Installation',
        amount: result.totalSteps || 0,
        materials: result.materials.map(material => ({
          name: material.name,
          quantity: material.amount,
          unit: material.unit
        })),
        taskBreakdown: taskBreakdown,
        canvasWidthCm,
        canvasLengthCm,
      };
      
      // Set taskBreakdown state for UI display
      setTaskBreakdown(taskBreakdown);

      // Store results in data attribute
      const calculatorElement = document.querySelector('[data-calculator-results]');
      if (calculatorElement) {
        calculatorElement.setAttribute('data-results', JSON.stringify(formattedResults));
      }

      // Notify parent component (canvas dimensions always from result; cutsData only for slab task breakdown)
      if (onResultsChange) {
        onResultsChange(formattedResults);
      }
    }
  }, [result, onResultsChange, slabType, cuttingTasks, cutsData, effectiveCalculateTransport, effectiveSelectedTransportCarrier, effectiveTransportDistance, slabsTransportHours, adhesiveMaterials, installationTasks, buildLeftSide, buildRightSide, slabThicknessFront, mixingMortarTask, taskTemplates]);

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
  
  // Handle material selection toggle
  const toggleMaterial = (materialId: string) => {
    setSelectedMaterials(prev => {
      if (prev.includes(materialId)) {
        return prev.filter(id => id !== materialId);
      } else {
        return [...prev, materialId];
      }
    });
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

  // Calculate the stair dimensions and materials
  const calculate = () => {
    setCalculationError(null);
    setAdjustedStepHeightInfo(null);
    
    // Validate inputs
    if (!totalHeight || !totalWidth || !stepTread || !stepHeight ||
        !masonryStartVsFinishedCm.trim() ||
        !slabThicknessTop || !slabThicknessSide || !slabThicknessFront ||
        !overhangFront || !overhangSide) {
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
      const { minBuriedDepthCm, maxBuriedDepthCm } = computeBuriedDepthBand(targetBuriedCm);

      // Parse input values to numbers
      const totalHeightNum = parseFloat(totalHeight);
      const totalWidthNum = parseFloat(totalWidth);
      const stepTreadNum = parseFloat(stepTread);
      const stepHeightNum = parseFloat(stepHeight);
      const slabThicknessTopNum = parseFloat(slabThicknessTop);
      const slabThicknessSideNum = parseFloat(slabThicknessSide);
      const slabThicknessFrontNum = parseFloat(slabThicknessFront);
      const overhangFrontNum = parseFloat(overhangFront);
      const overhangSideNum = parseFloat(overhangSide);
      
      // First calculate raw step count
      const rawStepCount = totalHeightNum / stepHeightNum;
      const stepCount = Math.round(rawStepCount);
      
      // Calculate actual step height so all steps are the same (for slabs/treads)
      // Accounting for slab thickness on top of each step
      const adjustedTotalHeight = totalHeightNum - slabThicknessTopNum;
      
      if (stepCount <= 0) {
        setCalculationError(t('calculator:invalid_step_count'));
        return;
      }
      
      // Calculate actual step height so all steps are the same (for slabs/treads)
      const actualStepHeight = totalHeightNum / stepCount;

      if (Math.abs(actualStepHeight - stepHeightNum) > 0.01) {
        setAdjustedStepHeightInfo(
          t('calculator:standard_step_height_adjusted', {
            from: stepHeightNum,
            to: actualStepHeight.toFixed(2),
            count: stepCount
          })
        );
      }
      
      // Calculate total length of stairs
      // Each step tread needs to account for slab thickness and overhang
      const adjustedStepTread = stepTreadNum - overhangFrontNum;
      
      const totalLength = computeStandardLinearTotalLength(
        adjustedStepTread,
        slabThicknessFrontNum,
        stepCount
      );
      
      // Calculate actual width of each step
      // Need to subtract side overhangs and slab thickness
      const actualStepWidth = totalWidthNum - (buildLeftSide ? (overhangSideNum + slabThicknessSideNum) : 0) 
                                          - (buildRightSide ? (overhangSideNum + slabThicknessSideNum) : 0);
      
      if (actualStepWidth <= 0) {
        setCalculationError(t('calculator:invalid_step_width'));
        return;
      }
      
      // Calculate materials needed
      let materials: Material[] = [];
      
      // Create array to store dimensions of each step
      const stepDimensions: StepDimension[] = [];
      
      // Create array to store the best material for each step
      const bestMaterialsForSteps: {
        step: number;
        materialId: string;
        blocks: number;
        rows: number;
        mortarHeight: number;
        podsadzka: number;
        needsCutting: boolean;
        buriedDepth?: number;
        _log?: { targetStepHeight: number; totalBlockHeight: number; totalSpaceForMortar: number; numberOfJoints: number };
      }[] = [];
      
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

      for (let i = 0; i < stepCount; i++) {
        const targetStepHeight =
          bestBlockStepHeight * (i + 1) - slabThicknessTopNum + globalBuriedDepthCm;
        const stepMat = computeSingleStepMaterialConfiguration({
          targetStepHeight,
          selectedMaterials,
          materialOptions: materialOptions as StairMaterialOption[],
          brickOrientation,
          minBuriedDepthCm,
          maxBuriedDepthCm,
          globalBuriedDepthCm,
        });

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

        let calculatedTread = adjustedStepTread;
        if (i === stepCount - 1) {
          calculatedTread = adjustedStepTread - slabThicknessFrontNum;
        }

        stepDimensions.push({
          height: targetStepHeight,
          tread: calculatedTread,
          isFirst: i === 0,
          remainingTread: adjustedStepTread,
          buriedDepth: stepMat.totalDepthBelowFinishedCm,
        });
      }
      
      // Second pass: Calculate blocks needed for each step using the best material
      // Group by material type
      const materialCounts: Record<string, {
        totalBlocks: number;
        courseDetails: {
          step: number;
          blocks: number;
          rows: number;
          material: string;
          mortarHeight: number;
          podsadzka: number;
          needsCutting: boolean;
          calculationLog?: string[];
        }[];
      }> = {};
      
      // Initialize material counts
      selectedMaterials.forEach(materialId => {
        materialCounts[materialId] = {
          totalBlocks: 0,
          courseDetails: []
        };
      });
      
      // Calculate blocks for each step using the best material
      bestMaterialsForSteps.forEach((bestMaterial, index) => {
        const materialOption = materialOptions.find(m => m.id === bestMaterial.materialId);
        if (!materialOption) return;
        
        // Get block dimensions
        // Use width as height when laying blocks flat (default)
        let blockHeight = materialOption.width;
        let blockWidth = materialOption.height; // When laid flat, height becomes width
        
        // For bricks, use the selected orientation
        if (materialOption.id === 'bricks') {
          if (brickOrientation === 'flat') {
            // When flat, height (6cm) becomes height, width (9cm) becomes width
            blockHeight = materialOption.height;
            blockWidth = materialOption.width;
          } else {
            // When on side, width (9cm) becomes height, height (6cm) becomes width
            blockHeight = materialOption.width;
            blockWidth = materialOption.height;
          }
        }
        
        const blockLength = materialOption.length;
        
        // Determine step tread based on configuration and position
        let stepTread = adjustedStepTread;
        if ((stepConfig === 'stepsToFronts' || stepConfig === 'frontsOnTop') && index === stepCount - 1) {
          // Last step is shorter when steps come to fronts or when fronts are on top
          stepTread = adjustedStepTread - slabThicknessFrontNum;
        }
        
        // Calculate the remaining length for this step
        // For each step, we need to calculate how much of the stair is left
        // Total length - sum of treads of steps before this one
        let previousStepsLength = 0;
        for (let j = 0; j < index; j++) {
          // Use the step dimensions we calculated earlier
          const stepDim = stepDimensions[j];
          previousStepsLength += stepDim.tread;
        }
        
        // Calculate the remaining length for this step
        const totalStairLength = totalLength;
        const remainingLength = totalStairLength - previousStepsLength;
        
        // Calculate front blocks - adjust width for side blocks if they exist
        let frontWidth = totalWidthNum;
        if (buildLeftSide) {
          // Subtract 23cm for the side block
          frontWidth -= 23;
        }
        if (buildRightSide) {
          // Subtract 23cm for the side block
          frontWidth -= 23;
        }
        
        // Ensure frontWidth is not negative
        frontWidth = Math.max(0, frontWidth);
        
        // Calculate blocks needed for each row of the front
        // Account for 1cm mortar joints between blocks
        const effectiveBlockLength = blockLength + 1; // Add 1cm for mortar joint
        const blocksPerRow = Math.ceil(frontWidth / effectiveBlockLength);

        // Calculate the individual step height for this specific step (height difference from previous step)
        // Total front blocks is just blocks per row times blocks per course height (fronts are always 1 row)
        const frontBlocks = blocksPerRow * bestMaterial.blocks;
        
        // Calculate blocks for sides (if needed)
        let sideBlocks = 0;
        let blocksForHeight = 0;
        let blocksPerSide = 0;
        let sidesCount = 0;
        if (buildLeftSide || buildRightSide) {
          // Calculate height difference from previous step
          const previousStepHeight = index > 0 ? stepDimensions[index - 1].height : 0;
          const heightDifference = stepDimensions[index].height - previousStepHeight;
          
          // Calculate blocks needed for the height difference
          blocksForHeight = Math.ceil(heightDifference / (blockHeight + 1)); // +1 for mortar joint
          
          // Calculate blocks needed for each side based on the remaining length
          const effectiveBlockLength = blockLength + 1; // Add 1cm for mortar joint
          blocksPerSide = Math.ceil(remainingLength / effectiveBlockLength);
          
          // Calculate total side blocks for this step
          sidesCount = (buildLeftSide ? 1 : 0) + (buildRightSide ? 1 : 0);
          sideBlocks = blocksForHeight * Math.max(1, blocksPerSide) * sidesCount;
        }
        
        // Calculate blocks for back (if needed)
        // Only calculate back blocks for steps after the first one
        let backBlocks = 0;
        if (buildBackSide && index > 0) {
          // Adjust width for blocks on the sides
          const backWidth = totalWidthNum - (buildLeftSide ? blockWidth : 0) - (buildRightSide ? blockWidth : 0);
          // Account for 1cm mortar joints between blocks
          const effectiveBlockLength = blockLength + 1; // Add 1cm for mortar joint
          // For back blocks, we only need one row per step
          backBlocks = Math.ceil(backWidth / effectiveBlockLength) * bestMaterial.blocks;
        }
        
        // Add up blocks for this step
        const stepBlocks = frontBlocks + sideBlocks + backBlocks;

        // Build calculation log for the winning configuration only
        const log = bestMaterial._log ? [
          `--- Step ${bestMaterial.step} ---`,
          `Wysokość: targetStepHeight = ${bestMaterial._log.targetStepHeight.toFixed(2)} cm`,
          `Bloczki: ${bestMaterial.blocks} × ${blockHeight} cm = ${(bestMaterial.blocks * blockHeight).toFixed(2)} cm`,
          `Przestrzeń na fugi: ${bestMaterial._log.targetStepHeight.toFixed(2)} - ${bestMaterial._log.totalBlockHeight.toFixed(2)} = ${bestMaterial._log.totalSpaceForMortar.toFixed(2)} cm`,
          `Podsadzka: ${(bestMaterial as any).podsadzka?.toFixed(2) ?? '2.00'} cm, fuga między bloczkami: ${bestMaterial.mortarHeight.toFixed(2)} cm`,
          bestMaterial.buriedDepth ? t('calculator:burial_depth_cm_vs_finished', { value: bestMaterial.buriedDepth.toFixed(2) }) : null,
          `Front: szer. ${frontWidth.toFixed(0)} cm, eff.dł.=${(blockLength + 1).toFixed(0)} cm → ceil(${frontWidth.toFixed(0)}/${(blockLength + 1).toFixed(0)}) = ${blocksPerRow} bl/rząd × ${bestMaterial.blocks} rzędów = ${frontBlocks}`,
          buildLeftSide || buildRightSide ? `Boki: wys.diff=${(stepDimensions[index].height - (index > 0 ? stepDimensions[index - 1].height : 0)).toFixed(0)} cm, dł.=${remainingLength.toFixed(0)} cm → ceil(${(stepDimensions[index].height - (index > 0 ? stepDimensions[index - 1].height : 0)) / (blockHeight + 1)})×ceil(${remainingLength}/${blockLength + 1})×${sidesCount} = ${sideBlocks} bl` : null,
          buildBackSide && index > 0 ? `Tył: ${backBlocks} bl` : null,
          `RAZEM: ${frontBlocks} + ${sideBlocks} + ${backBlocks} = ${stepBlocks} bloczków`
        ].filter(Boolean) : [];
        
        // Add to the material counts
        materialCounts[bestMaterial.materialId].totalBlocks += stepBlocks;
        materialCounts[bestMaterial.materialId].courseDetails.push({
          step: bestMaterial.step,
          blocks: stepBlocks,
          rows: bestMaterial.blocks,
          material: materialOption.name,
          mortarHeight: bestMaterial.mortarHeight,
          podsadzka: bestMaterial.podsadzka,
          needsCutting: bestMaterial.needsCutting,
          calculationLog: log
        });
      });
      
      // Create materials array from the counts
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
      
      // Calculate mortar needed
      // Typical mortar joint is 1cm thick
      // Estimate mortar volume based on number of blocks and average joint size
      const totalBlockCount = materials.reduce((sum, material) => sum + material.amount, 0);
      const mortarPerBlock = 0.5; // kg per block (approximate)
      let totalMortar = totalBlockCount * mortarPerBlock * 3; // Multiply by 3 for stairs
      
      // Calculate additional mortar for filling the U-shaped hole in each step
      // The blocks form a U shape (front + 2 sides), leaving a hole in the middle
      let totalHoleVolumeCubicMeters = 0;
      
      stepDimensions.forEach((step, index) => {
        // Width of hole = totalWidth - 2 × 23cm (subtract both sides)
        const holeWidth = totalWidthNum - (2 * 23); // cm
        
        // Depth of hole = step.tread - 21cm (subtract front)
        const holeDepth = step.tread - 21; // cm
        
        // Height of hole = cumulative riser column only (exclude burial added for block math)
        const holeHeight = Math.max(0, step.height - globalBuriedDepthCm);
        
        // Volume in cubic cm
        const holeVolumeCubicCm = holeWidth * holeDepth * holeHeight;
        
        // Convert to cubic meters (1 m³ = 1,000,000 cm³)
        const holeVolumeCubicMeters = holeVolumeCubicCm / 1000000;
        
        totalHoleVolumeCubicMeters += holeVolumeCubicMeters;
      });
      
      // Convert mortar volume to weight: 1 m³ mortar ≈ 1600 kg
      const mortarDensity = 1600; // kg/m³
      const additionalMortarKg = totalHoleVolumeCubicMeters * mortarDensity;
      
      // Add to total mortar
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
      
      // Note: Steps are typically transported on foot with individual carrying
      // No additional transport time calculations needed

      const maxDepthUsed = Math.max(
        globalBuriedDepthCm,
        ...stepDimensions.map(s => s.buriedDepth ?? 0)
      );
      const deepBurialWarning =
        maxDepthUsed - targetBuriedCm >= 5 ? t('calculator:stair_deep_burial_warning') : undefined;
      const firstStepFrontMasonryExtensionCm = Math.max(0, -masonryStartRaw - 0.5);
      
      // Set the result
      setResult({
        totalSteps: stepCount,
        totalLength: totalLength,
        materials: materials,
        stepDimensions: stepDimensions,
        totalWidth: totalWidthNum,
        sideOverhang: overhangSideNum,
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
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xl }}>
      <InfoBanner>
        <strong>{t('calculator:important_information_label')}</strong> — {t('calculator:standard_important_info')}
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
              <label style={labelStyle}>{t('calculator:input_total_width')}</label>
              <input type="number" value={totalWidth} onChange={(e) => setTotalWidth(e.target.value)} style={inputStyle} placeholder={t('calculator:placeholder_cm')} min="0" step="0.1" />
            </div>
            <div>
              <label style={labelStyle}>{t('calculator:input_step_tread')}</label>
              <input type="number" value={stepTread} onChange={(e) => setStepTread(e.target.value)} style={inputStyle} placeholder={t('calculator:placeholder_cm')} min="0" step="0.1" />
            </div>
            <div>
              <label style={labelStyle}>{t('calculator:input_step_height')}</label>
              <input type="number" value={stepHeight} onChange={(e) => setStepHeight(e.target.value)} style={inputStyle} placeholder={t('calculator:placeholder_cm')} min="0" step="0.1" />
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
          
          <h3 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.medium, color: colors.textPrimary, marginTop: spacing.lg, fontFamily: fonts.heading }}>{t('calculator:input_slab_adhesive_thickness_cm')}</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.lg }}>
            <div>
              <label style={labelStyle}>{t('calculator:input_slab_top_of_step')}</label>
              <input type="number" value={slabThicknessTop} onChange={(e) => setSlabThicknessTop(e.target.value)} style={inputStyle} placeholder={t('calculator:placeholder_cm')} min="0" step="0.1" />
            </div>
            <div>
              <label style={labelStyle}>{t('calculator:input_slab_side_of_step')}</label>
              <input type="number" value={slabThicknessSide} onChange={(e) => setSlabThicknessSide(e.target.value)} style={inputStyle} placeholder={t('calculator:placeholder_cm')} min="0" step="0.1" />
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
            <div>
              <label style={labelStyle}>{t('calculator:input_overhang_side')}</label>
              <input type="number" value={overhangSide} onChange={(e) => setOverhangSide(e.target.value)} style={inputStyle} placeholder={t('calculator:placeholder_cm')} min="0" step="0.1" />
            </div>
          </div>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
          <h3 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.medium, color: colors.textPrimary, fontFamily: fonts.heading }}>{t('calculator:input_sides_to_build')}</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
            <Checkbox label={t('calculator:input_sides_left')} checked={buildLeftSide} onChange={setBuildLeftSide} />
            <Checkbox label={t('calculator:input_sides_right')} checked={buildRightSide} onChange={setBuildRightSide} />
            <Checkbox label={t('calculator:input_sides_back')} checked={buildBackSide} onChange={setBuildBackSide} />
          </div>
          
          <h3 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.medium, color: colors.textPrimary, marginTop: spacing.lg, fontFamily: fonts.heading }}>{t('calculator:input_step_configuration')}</h3>
          
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
                label={translateMaterialName(material.name, t)}
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
                    <span style={{ fontSize: fontSizes.sm, color: colors.textSubtle, marginLeft: spacing.md }}>({carrier["size (in tones)"]} tons)</span>
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
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: spacing.md, padding: spacing.lg,
          background: `${colors.red}15`, border: `1px solid ${colors.red}40`,
          borderRadius: radii.xl, color: colors.textPrimary,
        }}>
          <AlertCircle style={{ width: 20, height: 20, color: colors.redLight, flexShrink: 0 }} />
          <p style={{ margin: 0, fontWeight: fontWeights.medium, fontFamily: fonts.body }}>{calculationError}</p>
        </div>
      )}
      
      {result && (
        <div ref={resultsRef}>
        <Card>
          <h3 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.semibold, color: colors.textPrimary, marginBottom: spacing.lg }}>{t('calculator:results_label')}</h3>
          
          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xl }}>
              <div style={{ width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm }}>
                <h4 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.medium, color: colors.textPrimary, margin: 0, fontFamily: fonts.heading }}>{t('calculator:step_details')}</h4>
                <div style={{ color: colors.red, fontSize: fontSizes.lg, fontWeight: fontWeights.bold }}>!</div>
              </div>
              <div style={{
                background: `${colors.red}20`, color: colors.textPrimary, fontSize: fontSizes.sm,
                padding: spacing.sm, marginBottom: spacing.sm, borderRadius: radii.lg,
                border: `1px solid ${colors.red}50`,
              }}>
                <p style={{ fontWeight: fontWeights.semibold, marginBottom: spacing.md, margin: 0, fontFamily: fonts.body }}>{t('calculator:calculation_logic')}:</p>
                  <ul style={{ listStyle: 'disc', paddingLeft: spacing.xl, margin: 0, display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                  <li>{t('calculator:standard_logic_step_row')}</li>
                  <li>{t('calculator:stair_logic_masonry_from_buried', { depth: (result.userTargetBuriedCm ?? 0).toFixed(1) })}</li>
                  <li>{t('calculator:standard_logic_sidewall')}</li>
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
              <div className="overflow-x-auto" style={{ border: `1px solid ${colors.borderDefault}`, borderRadius: radii["2xl"] }}>
                <table className="w-full table-fixed" style={{ backgroundColor: colors.bgCardInner }}>
                  <colgroup>
                    <col className="w-16" />
                    <col className="w-32" />
                    <col className="w-32" />
                    <col className="w-32" />
                    <col className="w-32" />
                    <col className="w-28" />
                    <col className="w-40" />
                    <col />
                  </colgroup>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${colors.borderDefault}`, background: colors.bgOverlay }}>
                      <th className="py-2 px-4 text-left" style={{ color: colors.textPrimary, fontWeight: fontWeights.semibold }}>{t('calculator:step_label')}</th>
                      <th className="py-2 px-4 text-left" style={{ color: colors.textPrimary, fontWeight: fontWeights.semibold }}>{t('calculator:table_height_cm')}</th>
                      <th className="py-2 px-4 text-left" style={{ color: colors.textPrimary, fontWeight: fontWeights.semibold }}>{t('calculator:standard_table_total_height_cm')}</th>
                      <th className="py-2 px-4 text-left" style={{ color: colors.textPrimary, fontWeight: fontWeights.semibold }}>{t('calculator:lshape_table_tread_cm')}</th>
                      <th className="py-2 px-4 text-left" style={{ color: colors.textPrimary, fontWeight: fontWeights.semibold }}>{t('calculator:table_length_cm')}</th>
                      <th className="py-2 px-4 text-left" style={{ color: colors.textPrimary, fontWeight: fontWeights.semibold }}>{t('calculator:lshape_table_total_rows')}</th>
                      <th className="py-2 px-4 text-left" style={{ color: colors.textPrimary, fontWeight: fontWeights.semibold }}>{t('calculator:standard_table_joint_bedding_header')}</th>
                      <th className="py-2 px-4 text-left" style={{ color: colors.textPrimary, fontWeight: fontWeights.semibold }}>{t('calculator:materials')}</th>
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
                      
                      // Calculate total length for this step
                      let previousStepsLength = 0;
                      for (let j = 0; j < index; j++) {
                        previousStepsLength += result.stepDimensions[j].tread;
                      }
                      
                      // Display length in opposite order - first step has the longest length
                      const displayLength = result.totalLength - previousStepsLength;
                      
                      return (
                        <React.Fragment key={index}>
                        <tr style={{
                          background: index % 2 === 0 ? 'transparent' : colors.bgTableRowAlt,
                          borderTop: `1px solid ${colors.borderDefault}`
                        }}>
                            <td className="py-2 px-4" style={{ color: colors.textPrimary }}>
                              {stepNumber}
                              <div style={{ fontSize: fontSizes.xs, color: colors.red }}>
                                {buriedDepth > 0 ? 
                                  t('calculator:standard_starts_at_buried', { value: buriedDepth.toFixed(1) }) : 
                                  t('calculator:standard_starts_at_zero')}
                              </div>
                            </td>
                            <td className="py-2 px-4" style={{ color: colors.textPrimary }}>
                              {(index === 0 ? step.height : step.height - result.stepDimensions[index - 1].height).toFixed(2)}
                            </td>
                          <td className="py-2 px-4" style={{ color: colors.textPrimary }}>
                            {step.height.toFixed(2)}
                            <div style={{ fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 4, lineHeight: 1.35 }}>
                              {t('calculator:stair_total_height_from_finished_note', {
                                value: (step.height - buriedDepth).toFixed(2),
                              })}
                            </div>
                          </td>
                          <td className="py-2 px-4" style={{ color: colors.textPrimary }}>{step.tread.toFixed(2)}</td>
                          <td className="py-2 px-4" style={{ color: colors.textPrimary }}>{displayLength.toFixed(2)}</td>
                          <td className="py-2 px-4" style={{ color: colors.textPrimary }}>
                            {stepCourseDetails.map((course, idx) => (
                              <div key={idx}>{course.rows}</div>
                            ))}
                          </td>
                          <td className="py-2 px-4" style={{ color: colors.textPrimary }}>
                            {stepCourseDetails.map((course, idx) => (
                              <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <span>
                                  {t('calculator:standard_mortar_joint_label')}: {course.mortarHeight.toFixed(2)}
                                </span>
                                <span>
                                  {t('calculator:standard_mortar_bedding_label')}: {course.podsadzka.toFixed(2)}
                                </span>
                              </div>
                            ))}
                          </td>
                          <td style={{ padding: `${spacing.md}px ${spacing.lg}px`, borderTop: `1px solid ${colors.borderDefault}` }}>
                            {stepCourseDetails.map((course, idx) => (
                              <div key={idx} style={{ color: course.needsCutting ? colors.amber : colors.textPrimary }}>
                                <div style={{ fontWeight: fontWeights.semibold, marginBottom: 2 }}>
                                  {translateMaterialName(course.material, t)}
                                </div>
                                <div>
                                  {course.blocks} {translateUnit('pieces', t)}
                                  {course.material === 'Standard Bricks (9x6x21)' ? (
                                    <> — {course.mortarHeight === 9 || step.height === 9 ? t('calculator:laid_on_side') : t('calculator:laid_flat')}</>
                                  ) : null}
                                  {course.needsCutting && ` ${t('calculator:needs_cutting')}`}
                                </div>
                              </div>
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
                {t('calculator:total_labor_hours_label')} <span style={{ color: colors.accentBlue }}>{
                  taskBreakdown && taskBreakdown.length > 0 
                    ? taskBreakdown.reduce((sum: number, task: any) => sum + (task.hours || 0), 0).toFixed(2)
                    : '0.00'
                } {t('calculator:hours_abbreviation')}</span>
              </h3>
              
              <div style={{ marginTop: spacing.md }}>
                <h4 style={{ fontWeight: fontWeights.medium, marginBottom: spacing.md, color: colors.textMuted, fontFamily: fonts.body }}>{t('calculator:task_breakdown_label')}</h4>
                <div style={{ border: `1px solid ${colors.borderDefault}`, borderRadius: radii.lg, overflow: 'hidden' }}>
                  {taskBreakdown && taskBreakdown.length > 0 ? (
                    taskBreakdown.map((task: any, index: number) => (
                      <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${spacing.lg}px ${spacing['4xl']}px`, background: index % 2 === 1 ? colors.bgTableRowAlt : undefined, borderBottom: index < taskBreakdown.length - 1 ? `1px solid ${colors.borderLight}` : 'none', fontSize: fontSizes.sm, color: colors.textMuted, fontFamily: fonts.body }}>
                        <span style={{ fontWeight: fontWeights.medium }}>{translateTaskName(task.task, t)}</span>
                        <span>x {task.amount} {translateUnit(task.unit, t)} = {task.hours.toFixed(2)} {t('calculator:hours_label')}</span>
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: `${spacing.lg}px ${spacing['4xl']}px`, fontSize: fontSizes.sm, color: colors.textSubtle }}>{t('calculator:no_tasks_label')}</div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="w-full">
              <h4 className="font-medium mb-2" style={{ color: colors.textPrimary }}>{t('calculator:total_materials_needed_label')}</h4>
              <div className="overflow-x-auto" style={{ border: `1px solid ${colors.borderDefault}`, borderRadius: radii["2xl"] }}>
                <table className="w-full" style={{ backgroundColor: colors.bgCardInner }}>
                  <thead style={{ borderBottom: `1px solid ${colors.borderDefault}`, background: colors.bgOverlay }}>
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: colors.textPrimary }}>
                        Material
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: colors.textPrimary }}>
                        Quantity
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: colors.textPrimary }}>
                        Unit
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.materials.map((material, index) => (
                      <tr key={index} style={{
                        background: index % 2 === 0 ? 'transparent' : colors.bgTableRowAlt,
                        borderTop: `1px solid ${colors.borderDefault}`
                      }}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm" style={{ color: colors.textPrimary }}>
                          {translateMaterialName(material.name, t)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm" style={{ color: colors.textPrimary }}>
                          {material.amount.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm" style={{ color: colors.textPrimary }}>
                          {translateUnit(material.unit, t)}
                        </td>
                      </tr>
                    ))}
                    {/* Add adhesive materials */}
                    {adhesiveMaterials && adhesiveMaterials.length > 0 && adhesiveMaterials.map((material: any, index: number) => (
                      <tr key={`adhesive-${index}`} style={{
                        background: (result.materials.length + index) % 2 === 0 ? 'transparent' : colors.bgTableRowAlt,
                        borderTop: `1px solid ${colors.borderDefault}`
                      }}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm" style={{ color: colors.textPrimary }}>
                          {translateMaterialName(material.name, t)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm" style={{ color: colors.textPrimary }}>
                          {material.amount}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm" style={{ color: colors.textPrimary }}>
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
                style={{
                  ...inputStyle,
                  cursor: 'pointer',
                }}
              >
                <option value="porcelain">Porcelain</option>
                <option value="granite">Granite</option>
                <option value="sandstone">Sandstone</option>
                <option value="concrete">Concrete</option>
              </select>
            </div>
          </Card>
          
          <StandardStairsSlabs 
            stairResult={result} 
            slabType={slabType}
            taskBreakdown={taskBreakdown}
            slabThicknessTop={parseFloat(slabThicknessTop) || 0}
            slabThicknessFront={parseFloat(slabThicknessFront) || 0}
            stepTreadInput={parseFloat(stepTread) || 30}
            stepConfig={stepConfig}
            gapBetweenSlabs={gapBetweenSlabs}
            calculateTransport={effectiveCalculateTransport}
            selectedTransportCarrier={effectiveSelectedTransportCarrier}
            transportDistance={effectiveTransportDistance}
            taskTemplates={taskTemplates}
            onCutsCalculated={(cuts) => {
              setCutsData(cuts);
            }}
            onAdhesiveMaterialsCalculated={(materials) => {
              setAdhesiveMaterials(materials);
            }}
            onSlabsTransportCalculated={(hours) => {
              setSlabsTransportHours(hours);
            }}
            onInstallationTasksCalculated={(tasks) => {
              setInstallationTasks(tasks);
            }}
            lastStepMode={lastStepMode}
          />
        </div>
      )}
    </div>
  );
};

export default StairCalculator;
