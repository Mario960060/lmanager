import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle } from 'lucide-react';
import StandardStairsSlabs from './StandardStairsSlabs';
import { carrierSpeeds, getMaterialCapacity } from '../../constants/materialCapacity';

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
  
  // Brick orientation (kept for calculations but removed from UI)
  const [brickOrientation, setBrickOrientation] = useState<'flat' | 'side'>('flat');
  
  // Material selection - updated to allow multiple materials
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>(['blocks4', 'blocks7']);
  
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
  
  // Results
  const [result, setResult] = useState<StairResult | null>(null);
  const [calculationError, setCalculationError] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  
  // Add useEffect to notify parent of result changes
  useEffect(() => {
    if (result && result.materials.length > 0) {
      const formattedResults = {
        name: 'Stair Installation',
        amount: result.totalSteps || 0,
        materials: result.materials.map(material => ({
          name: material.name,
          quantity: material.amount,
          unit: material.unit
        }))
      };

      // Store results in data attribute
      const calculatorElement = document.querySelector('[data-calculator-results]');
      if (calculatorElement) {
        calculatorElement.setAttribute('data-results', JSON.stringify(formattedResults));
      }

      // Notify parent component
      if (onResultsChange) {
        onResultsChange(formattedResults);
      }
    }
  }, [result, onResultsChange]);

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
      setCalculationError('Please fill in all required measurements');
      return;
    }
    
    if (selectedMaterials.length === 0) {
      setCalculationError('Please select at least one material');
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
        setCalculationError('Invalid step count. Please check your measurements.');
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
        setCalculationError('Invalid step width. Please check your measurements.');
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
                
                // Try with standard 1cm joints first
                const heightWithStandardJoints = totalBlockHeight + (numberOfJoints * 1);
                
                if (heightWithStandardJoints <= blockStepHeight && 
                    heightWithStandardJoints >= blockStepHeight - 0.5) {
                  // Perfect fit with 1cm joints
                found = true;
                break;
              }
                
                // If standard joints don't work, try adjusting joint size
                if (heightWithStandardJoints < blockStepHeight) {
                  const remainingSpace = blockStepHeight - totalBlockHeight;
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
            
            // Try standard joints first (1cm)
            const heightWithStandardJoints = totalBlockHeight + (numberOfJoints * 1);
            
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
              const remainingSpace = targetStepHeight - totalBlockHeight;
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
        let calculatedTread = stepTreadNum;
        if (stepConfig === 'frontsOnTop' && i !== stepCount - 1) {
          // For fronts on top: add slab thickness minus 0.5mm (0.05cm)
          calculatedTread = stepTreadNum + slabThicknessFrontNum - 0.05;
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
          // Subtract 20cm for the side block
          frontWidth -= 20;
        }
        if (buildRightSide) {
          // Subtract 20cm for the side block
          frontWidth -= 20;
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
        const individualStepHeightDifference = currentStepHeight - previousStepHeight;
        const rowsForThisStep = Math.ceil(individualStepHeightDifference / (blockHeight + 1)); // Rows needed for this step's height difference only

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

          console.log(`Step ${index + 1} side calculation:`, {
            previousHeight: previousStepHeight,
            currentHeight: stepDimensions[index].height,
            heightDifference,
            blocksForHeight,
            blocksPerSide,
            sideBlocks
          });
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
        
        // Debug log for block calculation per step
        console.log(`Step ${bestMaterial.step}: Material: ${materialOption.name}, Blocks per row: ${blocksPerRow}, Rows: ${rowsForThisStep}, Front blocks: ${frontBlocks}, Side blocks: ${sideBlocks}, Back blocks: ${backBlocks}, Total blocks for step: ${stepBlocks}`);
        
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
      const totalMortar = totalBlockCount * mortarPerBlock;
      
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
      setCalculationError('An error occurred during calculation. Please check your inputs.');
    }
  };
  
  return (
    <div className="space-y-6">
      <div className="bg-gray-100 p-4 rounded-lg relative">
        <h3 className="text-lg font-medium text-gray-800 mb-2">Important Information</h3>
        <p className="text-sm text-gray-700">
          This calculator accounts for slab thickness and adhesive on each step. These built stairs will be shorter than raw measurements but after adding slabs will be exact same like measurements.
          All measurements should be in centimeters.
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-800">Measurements (in cm)</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Total Height
              </label>
              <input
                type="number"
                value={totalHeight}
                onChange={(e) => setTotalHeight(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="cm"
                min="0"
                step="0.1"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Total Width
              </label>
              <input
                type="number"
                value={totalWidth}
                onChange={(e) => setTotalWidth(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="cm"
                min="0"
                step="0.1"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Step Tread
              </label>
              <input
                type="number"
                value={stepTread}
                onChange={(e) => setStepTread(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="cm"
                min="0"
                step="0.1"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Step Height
              </label>
              <input
                type="number"
                value={stepHeight}
                onChange={(e) => setStepHeight(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="cm"
                min="0"
                step="0.1"
              />
            </div>
          </div>
          
          <h3 className="text-lg font-medium text-gray-800 mt-4">Slab & Adhesive Thickness (in cm)</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Top of Step
              </label>
              <input
                type="number"
                value={slabThicknessTop}
                onChange={(e) => setSlabThicknessTop(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="cm"
                min="0"
                step="0.1"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Side of Step
              </label>
              <input
                type="number"
                value={slabThicknessSide}
                onChange={(e) => setSlabThicknessSide(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="cm"
                min="0"
                step="0.1"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Front of Step
              </label>
              <input
                type="number"
                value={slabThicknessFront}
                onChange={(e) => setSlabThicknessFront(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="cm"
                min="0"
                step="0.1"
              />
            </div>
          </div>
          
          <h3 className="text-lg font-medium text-gray-800 mt-4">Overhang (in cm)</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Front Overhang
              </label>
              <input
                type="number"
                value={overhangFront}
                onChange={(e) => setOverhangFront(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="cm"
                min="0"
                step="0.1"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Side Overhang
              </label>
              <input
                type="number"
                value={overhangSide}
                onChange={(e) => setOverhangSide(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="cm"
                min="0"
                step="0.1"
              />
            </div>
          </div>
        </div>
        
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-800">Sides to Build</h3>
          
          <div className="space-y-2">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="leftSide"
                checked={buildLeftSide}
                onChange={(e) => setBuildLeftSide(e.target.checked)}
                className="h-4 w-4 text-gray-600 rounded"
              />
              <label htmlFor="leftSide" className="ml-2 text-sm text-gray-700">
                Left Side
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
              <label htmlFor="rightSide" className="ml-2 text-sm text-gray-700">
                Right Side
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
              <label htmlFor="backSide" className="ml-2 text-sm text-gray-700">
                Back Side
              </label>
            </div>
          </div>
          
          <h3 className="text-lg font-medium text-gray-800 mt-4">Step Configuration</h3>
          
          <div className="space-y-2">
            <div className="flex items-center">
              <input
                type="radio"
                id="frontsOnTop"
                checked={stepConfig === 'frontsOnTop'}
                onChange={() => setStepConfig('frontsOnTop')}
                className="h-4 w-4 text-gray-600 rounded"
              />
              <label htmlFor="frontsOnTop" className="ml-2 text-sm text-gray-700">
                Fronts on top of steps
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
              <label htmlFor="stepsToFronts" className="ml-2 text-sm text-gray-700">
                Steps coming to the fronts
              </label>
            </div>
          </div>
          
          <h3 className="text-lg font-medium text-gray-800 mt-4">Material Selection (Select one or more)</h3>
          
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
                <label htmlFor={material.id} className="ml-2 text-sm text-gray-700">
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
            <span className="text-sm font-medium text-gray-700">Calculate transport time (default as 0.125 wheelbarrow)</span>
          </label>

          {/* Transport Carrier Selection */}
          {calculateTransport && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Transport Carrier (optional - defaults to 0.125 wheelbarrow)</label>
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
                    <span className="text-gray-800">Default (0.125t Wheelbarrow)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mt-6">
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Transport Distance in meters (each way)</label>
              <input
                type="number"
                value={transportDistance}
                onChange={(e) => setTransportDistance(e.target.value)}
                className="w-full p-2 border rounded-md"
                placeholder="Enter transport distance"
                min="0"
                step="1"
              />
            </div>
            <button
              onClick={calculate}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
            >
              Calculate
            </button>
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
        <div ref={resultsRef} className="bg-gray-800 p-6 rounded-lg text-white">
          <h3 className="text-xl font-semibold text-white mb-4">Results</h3>
          
          <div className="overflow-x-auto">
            <div className="flex flex-col gap-6">
              <div className="w-full">
              <h4 className="text-lg font-medium text-white mb-3">Step Details</h4>
              <div className="overflow-x-auto border border-gray-700 rounded-lg w-full">
                <table className="w-full table-fixed bg-gray-700 rounded-lg">
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
                    <tr className="border-b border-gray-600">
                      <th className="py-2 px-4 text-left text-gray-300">Step</th>
                      <th className="py-2 px-4 text-left text-gray-300">Height (cm)</th>
                        <th className="py-2 px-4 text-left text-gray-300">Total Height (cm)</th>
                      <th className="py-2 px-4 text-left text-gray-300">Tread (cm)</th>
                      <th className="py-2 px-4 text-left text-gray-300">Length (cm)</th>
                      <th className="py-2 px-4 text-left text-gray-300">Mortar (cm)</th>
                      <th className="py-2 px-4 text-left text-gray-300">Materials</th>
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
                        <tr key={index} className={index % 2 === 0 ? "bg-gray-750" : "bg-gray-700"}>
                            <td className="py-2 px-4 border-t border-gray-600">
                              {stepNumber}
                              <div className="text-xs text-red-500">
                                {buriedDepth > 0 ? 
                                  `Starts at: -${buriedDepth.toFixed(1)}cm (buried)` : 
                                  'Starts at: 0.0cm'}
                              </div>
                            </td>
                            <td className="py-2 px-4 border-t border-gray-600">
                              {(index === 0 ? step.height : step.height - result.stepDimensions[index - 1].height).toFixed(2)}
                            </td>
                          <td className="py-2 px-4 border-t border-gray-600">{step.height.toFixed(2)}</td>
                          <td className="py-2 px-4 border-t border-gray-600">{step.tread.toFixed(2)}</td>
                          <td className="py-2 px-4 border-t border-gray-600">{displayLength.toFixed(2)}</td>
                          <td className="py-2 px-4 border-t border-gray-600">
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
              <h4 className="text-lg font-medium text-white mb-2">Total Materials Needed</h4>
              <div className="space-y-3 bg-gray-700 p-4 rounded-lg">
                {result.materials.map((material, index) => (
                  <div key={index} className="flex justify-between items-center">
                    <span className="text-gray-300">{material.name}:</span>
                    <span className="font-medium">
                      {material.amount.toFixed(2)} {material.unit}
                    </span>
                  </div>
                ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {result && <StandardStairsSlabs stairResult={result} />}
    </div>
  );
};

export default StairCalculator;
