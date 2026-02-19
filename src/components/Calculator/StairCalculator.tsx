import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import StandardStairsSlabs from './StandardStairsSlabs';
import { carrierSpeeds, getMaterialCapacity } from '../../constants/materialCapacity';
import { translateTaskName } from '../../lib/translationMap';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { useTheme, getCardWithShadowStyle, getButtonStyle, getTableHeaderStyle, getTableRowStyle } from '../../themes';

interface Material {
  name: string;
  amount: number;
  unit: string;
  price_per_unit: number | null;
  total_price: number | null;
  courseDetails?: {step: number; blocks: number; rows: number; material: string; mortarHeight: number; needsCutting?: boolean}[];
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
  selectedExcavator: propSelectedExcavator
}) => {
  const { user } = useAuthStore();
  const companyId = useAuthStore(state => state.getCompanyId());
  const { currentTheme } = useTheme();
  const { t } = useTranslation(['calculator', 'utilities', 'common']);
  // Input measurements
  const [totalHeight, setTotalHeight] = useState<string>('');
  const [totalWidth, setTotalWidth] = useState<string>('');
  const [stepTread, setStepTread] = useState<string>('');
  const [stepHeight, setStepHeight] = useState<string>('');
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

  // Sync local state back to parent when in ProjectCreating
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
      name: '7-inch Blocks',
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
  
  // Define acceptable mortar thickness range
  const mortarRange = {
    min: 0.5, // Minimum acceptable mortar thickness in cm
    max: 3    // Maximum acceptable mortar thickness in cm
  };
  
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
  const resultsRef = useRef<HTMLDivElement>(null);
  
  // Add useEffect to notify parent of result changes
  useEffect(() => {
    if (result && result.materials.length > 0) {
      // Calculate task breakdown for cutting tasks
      const taskBreakdown = [];
      
      // Add building tasks for blocks/bricks
      result.materials.forEach(material => {
        // Find matching "building steps with X" task
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
      if (calculateTransport && slabsTransportHours > 0) {
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
        // Find mortar material in results
        const mortarMaterial = result.materials.find(m => m.name.toLowerCase() === 'mortar');
        if (mortarMaterial && mortarMaterial.amount > 0) {
          // Calculate number of batches (125kg per batch, same as SlabCalculator)
          const numberOfBatches = Math.ceil(mortarMaterial.amount / 125);
          taskBreakdown.push({
            task: 'mixing mortar',
            hours: numberOfBatches * mixingMortarTask.estimated_hours,
            amount: numberOfBatches,
            unit: 'batch'
          });
        }
      }
      
      // Add transport for materials if calculateTransport is enabled
      if (calculateTransport && selectedTransportCarrier) {
        const transportDistanceMeters = parseFloat(transportDistance) || 30;
        const carrierSize = selectedTransportCarrier["size (in tones)"] || 0.125;
        
        // Calculate transport for blocks/bricks
        result.materials.forEach(material => {
          const materialType = material.name.toLowerCase().includes('brick') ? 'bricks' : 'blocks';
          const transportResult = calculateMaterialTransportTime(
            material.amount,
            carrierSize,
            materialType,
            transportDistanceMeters
          );
          
          if (transportResult.totalTransportTime > 0) {
            taskBreakdown.push({
              task: `transport ${material.name.toLowerCase()}`,
              hours: transportResult.totalTransportTime,
              amount: material.amount,
              unit: material.unit
            });
          }
        });
      }
      
      const formattedResults = {
        name: 'Stair Installation',
        amount: result.totalSteps || 0,
        materials: result.materials.map(material => ({
          name: material.name,
          quantity: material.amount,
          unit: material.unit
        })),
        taskBreakdown: taskBreakdown
      };
      
      // Set taskBreakdown state for UI display
      setTaskBreakdown(taskBreakdown);

      // Store results in data attribute
      const calculatorElement = document.querySelector('[data-calculator-results]');
      if (calculatorElement) {
        calculatorElement.setAttribute('data-results', JSON.stringify(formattedResults));
      }

      // Notify parent component - tylko kiedy mamy cutsData
      if (onResultsChange && cutsData) {
        onResultsChange(formattedResults);
      }
    }
  }, [result, onResultsChange, slabType, cuttingTasks, cutsData, calculateTransport, selectedTransportCarrier, transportDistance, slabsTransportHours, adhesiveMaterials, installationTasks]);

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
    const carrierSpeed = carrierSpeedData?.speed || 4000;
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
    
    // Validate inputs
    if (!totalHeight || !totalWidth || !stepTread || !stepHeight || 
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
      
      // Calculate total length of stairs
      // Each step tread needs to account for slab thickness and overhang
      const adjustedStepTread = stepTreadNum - overhangFrontNum;
      
      // Calculate total length based on step configuration
      let totalLength = 0;
      if (stepConfig === 'frontsOnTop') {
        // All steps have the same tread except the last one which is shorter by the slab thickness
        const regularStepTread = adjustedStepTread;
        const lastStepTread = adjustedStepTread - slabThicknessFrontNum;
        totalLength = (regularStepTread * (stepCount - 1)) + lastStepTread;
      } else {
        // When steps come to fronts, the last step is shorter by the slab thickness
        const regularStepTread = adjustedStepTread;
        const lastStepTread = adjustedStepTread - slabThicknessFrontNum;
        totalLength = (regularStepTread * (stepCount - 1)) + lastStepTread;
      }
      
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
        needsCutting: boolean;
        buriedDepth?: number;
      }[] = [];
      
      // --- BEGIN: Find best buried depth for block calculation ---
      let bestBuriedDepth = 2;
      let bestBuriedDepthDiff = Infinity;
      let bestBlockStepHeight = actualStepHeight;

      // First check if blocks fit without burying
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

      // If blocks are too high, try different buried depths
      if (needsBurying) {
      for (let buriedDepth = 2; buriedDepth <= 8; buriedDepth++) {
          const blockAdjustedTotalHeight = totalHeightNum - buriedDepth;
        if (blockAdjustedTotalHeight <= 0) continue;
        const blockStepHeight = blockAdjustedTotalHeight / stepCount;

        // Try to build all steps with full blocks and allowed mortar (no cutting)
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
                
                // Try with standard 1cm joints first (2cm on bottom + 1cm between blocks)
                const heightWithStandardJoints = totalBlockHeight + 2 + (numberOfJoints * 1);
                
                if (heightWithStandardJoints <= blockStepHeight && 
                    heightWithStandardJoints >= blockStepHeight - 0.5) {
                  // Perfect fit with 1cm joints
                found = true;
                break;
              }
                
                // If standard joints don't work, try adjusting joint size
                if (heightWithStandardJoints < blockStepHeight) {
                  const remainingSpace = blockStepHeight - totalBlockHeight - 2; // Subtract 2cm bottom mortar
                  const neededJointSize = numberOfJoints > 0 ? remainingSpace / numberOfJoints : 0;
                  
                  if (neededJointSize >= mortarRange.min && neededJointSize <= mortarRange.max) {
                    found = true;
                    break;
                  }
                }
            }
            if (found) break;
          }
          if (!found) {
            canBuildAll = false;
            break;
          }
        }

        if (canBuildAll) {
          const diff = Math.abs(buriedDepth - 5);
          if (diff < bestBuriedDepthDiff) {
            bestBuriedDepth = buriedDepth;
            bestBuriedDepthDiff = diff;
              bestBlockStepHeight = blockStepHeight;
          }
        }
        }
      } else {
        bestBuriedDepth = 2; // Use minimum buried depth if no burying needed
        bestBlockStepHeight = actualStepHeight;
      }
      // --- END: Find best buried depth for block calculation ---
      
      // First pass: Find the best material for each step
      for (let i = 0; i < stepCount; i++) {
        // Calculate total height at this step, accounting for slab thickness
        const targetStepHeight = actualStepHeight * (i + 1) - slabThicknessTopNum;
        let bestBuriedDepth = 0;
        let bestConfiguration = null;

        // Try each material to find the best fit for this step height
        for (const materialId of selectedMaterials) {
          const materialOption = materialOptions.find(m => m.id === materialId);
          if (!materialOption) continue;
          
          let blockHeight = materialOption.width;
          if (materialOption.id === 'bricks') {
            blockHeight = brickOrientation === 'flat' ? materialOption.height : materialOption.width;
          }

          // Try different block counts
          const maxBlocksNeeded = Math.ceil(targetStepHeight / blockHeight);

          // Try configurations with different numbers of blocks
          for (let blocksNeeded = 1; blocksNeeded <= maxBlocksNeeded + 1; blocksNeeded++) {
            const totalBlockHeight = blocksNeeded * blockHeight;
            const numberOfJoints = blocksNeeded - 1;
            
            // Try standard joints first (1cm) with 2cm bottom mortar
            const heightWithStandardJoints = totalBlockHeight + 2 + (numberOfJoints * 1);
            
            // Check if we need to bury this configuration
            if (heightWithStandardJoints > targetStepHeight) {
              const buriedDepth = heightWithStandardJoints - targetStepHeight;
              if (buriedDepth <= 8) { // Max burial depth of 8cm
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
            
            // If standard joints are too short, try adjusting joint size
            if (heightWithStandardJoints < targetStepHeight) {
              const remainingSpace = targetStepHeight - totalBlockHeight - 2; // Subtract 2cm bottom mortar
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

        // If no perfect configuration found, use the best available with cutting
        if (!bestConfiguration) {
          bestConfiguration = {
            materialId: selectedMaterials[0],
            blocks: Math.ceil(targetStepHeight / (materialOptions.find(m => m.id === selectedMaterials[0])?.width || 10)),
            mortarHeight: 1,
            needsCutting: true,
            buriedDepth: 0
          };
        }
        
        // Store the best material for this step
        bestMaterialsForSteps.push({
          step: i + 1,
          materialId: bestConfiguration.materialId,
          blocks: bestConfiguration.blocks,
          rows: 0,
          mortarHeight: bestConfiguration.mortarHeight,
          needsCutting: bestConfiguration.needsCutting,
          buriedDepth: bestConfiguration.buriedDepth
        });
        
        // Store the dimensions of this step
        let calculatedTread = adjustedStepTread; // stepTread - overhangFront
        if (i === stepCount - 1) {
          // Last step: shorter by front slab thickness (no next step to cover it)
          calculatedTread = adjustedStepTread - slabThicknessFrontNum;
        }
        
        stepDimensions.push({
          height: targetStepHeight,
          tread: calculatedTread,
          isFirst: i === 0,
          remainingTread: adjustedStepTread,
          buriedDepth: bestConfiguration.buriedDepth
        });
      }
      
      // Second pass: Calculate blocks needed for each step using the best material
      // Group by material type
      const materialCounts: Record<string, {
        totalBlocks: number;
        courseDetails: {step: number; blocks: number; rows: number; material: string; mortarHeight: number; needsCutting: boolean}[];
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
        const previousStepHeight = index > 0 ? stepDimensions[index - 1].height : 0;
        const currentStepHeight = stepDimensions[index].height;
        const rowsForThisStep = Math.ceil(currentStepHeight / (blockHeight + 1)); // Total height to this step

        // Total front blocks is just blocks per row times blocks per course height (fronts are always 1 row)
        const frontBlocks = blocksPerRow * bestMaterial.blocks;
        
        // Calculate blocks for sides (if needed)
        let sideBlocks = 0;
        if (buildLeftSide || buildRightSide) {
          // Calculate height difference from previous step
          const previousStepHeight = index > 0 ? stepDimensions[index - 1].height : 0;
          const heightDifference = stepDimensions[index].height - previousStepHeight;
          
          // Calculate blocks needed for the height difference
          const blocksForHeight = Math.ceil(heightDifference / (blockHeight + 1)); // +1 for mortar joint
          
          // Calculate blocks needed for each side based on the remaining length
          const effectiveBlockLength = blockLength + 1; // Add 1cm for mortar joint
          const blocksPerSide = Math.ceil(remainingLength / effectiveBlockLength);
          
          // Calculate total side blocks for this step
          const sidesCount = (buildLeftSide ? 1 : 0) + (buildRightSide ? 1 : 0);
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
        
        // Add to the material counts
        materialCounts[bestMaterial.materialId].totalBlocks += stepBlocks;
        materialCounts[bestMaterial.materialId].courseDetails.push({
          step: bestMaterial.step,
          blocks: stepBlocks,
          rows: rowsForThisStep,
          material: materialOption.name,
          mortarHeight: bestMaterial.mortarHeight,
          needsCutting: bestMaterial.needsCutting
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
        
        // Height of hole = step height
        const holeHeight = step.height; // cm
        
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
      
      materials.push({
        name: 'Mortar',
        amount: totalMortar,
        unit: 'kg',
        price_per_unit: null,
        total_price: null
      });
      
      // Note: Steps are typically transported on foot with individual carrying
      // No additional transport time calculations needed
      
      // Set the result
      setResult({
        totalSteps: stepCount,
        totalLength: totalLength,
        materials: materials,
        stepDimensions: stepDimensions,
        totalWidth: totalWidthNum,
        sideOverhang: overhangSideNum,
      });
      
    } catch (error) {
      console.error('Calculation error:', error);
      setCalculationError(t('calculator:calculation_error'));
    }
  };
  
  return (
    <div className="space-y-6">
      <div className="bg-gray-100 p-4 rounded-lg relative">
        <h3 className="text-lg font-medium text-gray-800 mb-2">{t('calculator:important_information_label')}</h3>
        <p className="text-sm text-gray-700">
          This calculator accounts for slab thickness and adhesive on each step. These built stairs will be shorter than raw measurements but after adding slabs will be exact same like measurements.
          All measurements should be in centimeters.
        </p>
      </div>
      
      <div className="bg-gray-800 p-6 rounded-lg">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                {t('calculator:input_total_width')}
              </label>
              <input
                type="number"
                value={totalWidth}
                onChange={(e) => setTotalWidth(e.target.value)}
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
                {t('calculator:input_slab_side_of_step')}
              </label>
              <input
                type="number"
                value={slabThicknessSide}
                onChange={(e) => setSlabThicknessSide(e.target.value)}
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
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                {t('calculator:input_overhang_side')}
              </label>
              <input
                type="number"
                value={overhangSide}
                onChange={(e) => setOverhangSide(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder={t('calculator:placeholder_cm')}
                min="0"
                step="0.1"
              />
            </div>
          </div>
        </div>
        
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-white">{t('calculator:input_sides_to_build')}</h3>
          
          <div className="space-y-2">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="leftSide"
                checked={buildLeftSide}
                onChange={(e) => setBuildLeftSide(e.target.checked)}
                className="h-4 w-4 text-gray-600 rounded"
              />
              <label htmlFor="leftSide" className="ml-2 text-sm text-gray-300">
                {t('calculator:input_sides_left')}
              </label>
            </div>
            
            <div className="flex items-center">
              <input
                type="checkbox"
                id="rightSide"
                checked={buildRightSide}
                onChange={(e) => setBuildRightSide(e.target.checked)}
                className="h-4 w-4 text-gray-600 rounded"
              />
              <label htmlFor="rightSide" className="ml-2 text-sm text-gray-300">
                {t('calculator:input_sides_right')}
              </label>
            </div>
            
            <div className="flex items-center">
              <input
                type="checkbox"
                id="backSide"
                checked={buildBackSide}
                onChange={(e) => setBuildBackSide(e.target.checked)}
                className="h-4 w-4 text-gray-600 rounded"
              />
              <label htmlFor="backSide" className="ml-2 text-sm text-gray-300">
                {t('calculator:input_sides_back')}
              </label>
            </div>
          </div>
          
          <h3 className="text-lg font-medium text-white mt-4">{t('calculator:input_step_configuration')}</h3>
          
          <div className="space-y-2">
            <div className="flex items-center">
              <input
                type="radio"
                id="frontsOnTop"
                checked={stepConfig === 'frontsOnTop'}
                onChange={() => setStepConfig('frontsOnTop')}
                className="h-4 w-4 text-gray-600 rounded"
              />
              <label htmlFor="frontsOnTop" className="ml-2 text-sm text-gray-300">
                {t('calculator:input_step_config_fronts_on_top')}
              </label>
            </div>
            
            <div className="flex items-center">
              <input
                type="radio"
                id="stepsToFronts"
                checked={stepConfig === 'stepsToFronts'}
                onChange={() => setStepConfig('stepsToFronts')}
                className="h-4 w-4 text-gray-600 rounded"
              />
              <label htmlFor="stepsToFronts" className="ml-2 text-sm text-gray-300">
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
                    name="stair-gap"
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
                  id={material.id}
                  checked={selectedMaterials.includes(material.id)}
                  onChange={() => toggleMaterial(material.id)}
                  className="h-4 w-4 text-gray-600 rounded"
                />
                <label htmlFor={material.id} className="ml-2 text-sm text-gray-300">
                  {material.name}
                </label>
              </div>
            ))}
          </div>
          
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={calculateTransport}
              onChange={(e) => setCalculateTransport(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-gray-300">{t('calculator:input_calculate_transport_time')}</span>
          </label>

          {/* Transport Carrier Selection */}
          {calculateTransport && (
            <div className="space-y-4">
              <label className="block text-sm font-medium text-gray-300 mb-3">{t('calculator:input_transport_carrier_optional')}</label>
              <div className="space-y-2">
                <div 
                  className="flex items-center p-2 cursor-pointer border-2 border-dashed border-gray-300 rounded"
                  onClick={() => setSelectedTransportCarrier(null)}
                >
                  <div className={`w-4 h-4 rounded-full border mr-2 ${
                    selectedTransportCarrier === null 
                      ? 'border-gray-400' 
                      : 'border-gray-400'
                  }`}>
                    <div className={`w-2 h-2 rounded-full m-0.5 ${
                      selectedTransportCarrier === null 
                        ? 'bg-gray-400' 
                        : 'bg-transparent'
                    }`}></div>
                  </div>
                  <div>
                    <span className="text-gray-300">Default (0.125t Wheelbarrow)</span>
                  </div>
                </div>
                {carriers.length > 0 && carriers.map((carrier) => (
                  <div 
                    key={carrier.id}
                    className="flex items-center p-2 cursor-pointer"
                    onClick={() => setSelectedTransportCarrier(carrier)}
                  >
                    <div className={`w-4 h-4 rounded-full border mr-2 ${
                      selectedTransportCarrier?.id === carrier.id 
                        ? 'border-gray-400' 
                        : 'border-gray-400'
                    }`}>
                      <div className={`w-2 h-2 rounded-full m-0.5 ${
                        selectedTransportCarrier?.id === carrier.id 
                          ? 'bg-gray-400' 
                          : 'bg-transparent'
                      }`}></div>
                    </div>
                    <div>
                      <span className="text-gray-300">{carrier.name}</span>
                      <span className="text-sm text-gray-500 ml-2">({carrier["size (in tones)"]} tons)</span>
                    </div>
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
      
      {calculationError && (
        <div className="bg-red-50 p-4 rounded-lg flex items-start">
          <AlertCircle className="w-5 h-5 text-red-500 mr-2 mt-0.5" />
          <p className="text-red-700">{calculationError}</p>
        </div>
      )}
      
      {result && (
        <div ref={resultsRef} style={getCardWithShadowStyle(currentTheme)}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: '600', color: currentTheme.colors.textPrimary, marginBottom: '1rem' }}>{t('calculator:results_label')}</h3>
          
          <div className="overflow-x-auto">
            <div className="flex flex-col gap-6">
              <div className="w-full">
              <div className="flex items-center gap-2 mb-3">
                <h4 className="text-lg font-medium text-white">{t('calculator:step_details')}</h4>
                <div className="text-red-500 text-lg font-bold">!</div>
              </div>
              <div className="bg-red-900 text-white text-sm rounded p-3 mb-3 border border-red-700">
                <p className="font-semibold mb-2">{t('calculator:calculation_logic')}:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Each step is calculated as a separate row from the ground</li>
                  <li>Sidewall starts at the same height as 1st step (buried the same amount)</li>
                </ul>
              </div>
              <div className="overflow-x-auto" style={{ border: `1px solid ${currentTheme.colors.border}`, borderRadius: currentTheme.effects.borderRadius.large }}>
                <table className="w-full table-fixed" style={{ backgroundColor: currentTheme.colors.bgSecondary }}>
                  <colgroup>
                    <col className="w-16" />
                      <col className="w-32" />
                    <col className="w-32" />
                    <col className="w-32" />
                    <col className="w-32" />
                    <col className="w-32" />
                    <col />
                  </colgroup>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${currentTheme.colors.border}`, ...getTableHeaderStyle(currentTheme) }}>
                      <th className="py-2 px-4 text-left" style={{ color: currentTheme.colors.textPrimary }}>Step</th>
                      <th className="py-2 px-4 text-left" style={{ color: currentTheme.colors.textPrimary }}>Height (cm)</th>
                        <th className="py-2 px-4 text-left" style={{ color: currentTheme.colors.textPrimary }}>Total Height (cm)</th>
                      <th className="py-2 px-4 text-left" style={{ color: currentTheme.colors.textPrimary }}>Tread (cm)</th>
                      <th className="py-2 px-4 text-left" style={{ color: currentTheme.colors.textPrimary }}>Length (cm)</th>
                      <th className="py-2 px-4 text-left" style={{ color: currentTheme.colors.textPrimary }}>Mortar (cm)</th>
                      <th className="py-2 px-4 text-left" style={{ color: currentTheme.colors.textPrimary }}>Materials</th>
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
                        <tr key={index} style={{
                          ...getTableRowStyle(currentTheme, index % 2 === 0),
                          borderTop: `1px solid ${currentTheme.colors.border}`
                        }}>
                            <td className="py-2 px-4" style={{ color: currentTheme.colors.textPrimary }}>
                              {stepNumber}
                              <div style={{ fontSize: '0.75rem', color: currentTheme.colors.error }}>
                                {buriedDepth > 0 ? 
                                  `Starts at: -${buriedDepth.toFixed(1)}cm (buried)` : 
                                  'Starts at: 0.0cm'}
                              </div>
                            </td>
                            <td className="py-2 px-4" style={{ color: currentTheme.colors.textPrimary }}>
                              {(index === 0 ? step.height : step.height - result.stepDimensions[index - 1].height).toFixed(2)}
                            </td>
                          <td className="py-2 px-4" style={{ color: currentTheme.colors.textPrimary }}>{step.height.toFixed(2)}</td>
                          <td className="py-2 px-4" style={{ color: currentTheme.colors.textPrimary }}>{step.tread.toFixed(2)}</td>
                          <td className="py-2 px-4" style={{ color: currentTheme.colors.textPrimary }}>{displayLength.toFixed(2)}</td>
                          <td className="py-2 px-4" style={{ color: currentTheme.colors.textPrimary }}>
                            {stepCourseDetails.map((course, idx) => (
                              <div key={idx}>
                                {course.mortarHeight.toFixed(2)}
                              </div>
                            ))}
                          </td>
                          <td className="py-2 px-4 border-t border-gray-600">
                            {stepCourseDetails.map((course, idx) => (
                              <div key={idx} className={course.needsCutting ? "text-yellow-400" : ""}>
                                {course.blocks} x {course.material === 'Standard Bricks (9x6x21)' ? 'brick' : course.material} {course.material === 'Standard Bricks (9x6x21)' ? 
                                  (course.mortarHeight === 9 || step.height === 9 ? 'laid on side' : 'laid flat') : 
                                  ''}
                                {course.needsCutting && " (needs cutting)"}
                              </div>
                            ))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            
              <div className="w-full">
              <h3 className="text-lg font-medium">{t('calculator:total_labor_hours_label')} <span className="text-blue-600">{
                taskBreakdown && taskBreakdown.length > 0 
                  ? taskBreakdown.reduce((sum: number, task: any) => sum + (task.hours || 0), 0).toFixed(2)
                  : '0.00'
              } {t('calculator:hours_abbreviation')}</span></h3>
              
              <div className="mt-2">
                <h4 className="font-medium text-gray-700 mb-2">{t('calculator:task_breakdown_label')}</h4>
                <ul className="space-y-1 pl-5 list-disc">
                  {taskBreakdown && taskBreakdown.length > 0 ? (
                    <>
                      {taskBreakdown.map((task: any, index: number) => (
                        <li key={index} className="text-sm">
                          <span className="font-medium">{translateTaskName(task.task, t)}</span> x {task.amount} {task.unit} = {task.hours.toFixed(2)} hours
                        </li>
                      ))}
                    </>
                  ) : (
                    <li className="text-sm text-gray-500">No tasks</li>
                  )}
                </ul>
              </div>
            </div>
            
            <div className="w-full">
              <h4 className="font-medium mb-2 text-white">{t('calculator:total_materials_needed_label')}</h4>
              <div className="overflow-x-auto" style={{ border: `1px solid ${currentTheme.colors.border}`, borderRadius: currentTheme.effects.borderRadius.large }}>
                <table className="w-full" style={{ backgroundColor: currentTheme.colors.bgSecondary }}>
                  <thead style={{ borderBottom: `1px solid ${currentTheme.colors.border}`, ...getTableHeaderStyle(currentTheme) }}>
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: currentTheme.colors.textPrimary }}>
                        Material
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: currentTheme.colors.textPrimary }}>
                        Quantity
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: currentTheme.colors.textPrimary }}>
                        Unit
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
                    {/* Add adhesive materials */}
                    {adhesiveMaterials && adhesiveMaterials.length > 0 && adhesiveMaterials.map((material: any, index: number) => (
                      <tr key={`adhesive-${index}`} style={{
                        ...getTableRowStyle(currentTheme, (result.materials.length + index) % 2 === 0),
                        borderTop: `1px solid ${currentTheme.colors.border}`
                      }}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm" style={{ color: currentTheme.colors.textPrimary }}>
                          {material.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm" style={{ color: currentTheme.colors.textPrimary }}>
                          {material.amount}
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
          
          <StandardStairsSlabs 
            stairResult={result} 
            slabType={slabType}
            taskBreakdown={taskBreakdown}
            slabThicknessTop={parseFloat(slabThicknessTop) || 0}
            slabThicknessFront={parseFloat(slabThicknessFront) || 0}
            stepTreadInput={parseFloat(stepTread) || 30}
            stepConfig={stepConfig}
            gapBetweenSlabs={gapBetweenSlabs}
            calculateTransport={calculateTransport}
            selectedTransportCarrier={selectedTransportCarrier}
            transportDistance={transportDistance}
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
          />
        </div>
      )}
    </div>
  );
};

export default StairCalculator;
