import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface SlabDimension {
  size: string;
  width: number;
  length: number;
}

interface SlabCuttingOption {
  type: string;
  description: string;
}

interface SlabGapOption {
  value: number;
  label: string;
}

interface StepDimension {
  height: number;
  tread: number;
  isFirst: boolean;
  remainingTread: number;
}

interface WasteMaterial {
  width: number;
  length: number;
  source: string;
  canBeRotated?: boolean;
}

interface StairResult {
  totalSteps: number;
  totalLength: number;
  materials: any[];
  stepDimensions: StepDimension[];
  totalWidth?: number; // Add this to capture the total width from input
  sideOverhang?: number; // Add this to capture the sideOverhang from input
}

interface CutCalculation {
  dimension: number;
  count: number;
}

const ADHESIVE_THICKNESS = [
  { value: 0.5, consumption: 6 },
  { value: 1, consumption: 12 }
];

interface StandardStairsSlabsProps {
  stairResult: StairResult | null;
  slabType?: string;
  taskBreakdown?: any[];
  slabThicknessTop?: number;
  slabThicknessFront?: number;
  stepTreadInput?: number;
  stepConfig?: 'frontsOnTop' | 'stepsToFronts';
  gapBetweenSlabs?: number;
  calculateTransport?: boolean;
  selectedTransportCarrier?: any;
  transportDistance?: string;
  taskTemplates?: any[];
  onCutsCalculated?: (cuts: { lengthCuts: CutCalculation[], widthCuts: CutCalculation[] }) => void;
  onAdhesiveMaterialsCalculated?: (materials: any[]) => void;
  onSlabsTransportCalculated?: (transportHours: number) => void;
  onInstallationTasksCalculated?: (tasks: any[]) => void;
}

const StandardStairsSlabs: React.FC<StandardStairsSlabsProps> = ({ 
  stairResult, 
  slabType = 'porcelain', 
  taskBreakdown = [], 
  slabThicknessTop = 0,
  slabThicknessFront = 0,
  stepTreadInput = 30,
  stepConfig = 'frontsOnTop',
  gapBetweenSlabs = 2,
  calculateTransport = false,
  selectedTransportCarrier = null,
  transportDistance = '30',
  taskTemplates = [],
  onCutsCalculated,
  onAdhesiveMaterialsCalculated,
  onSlabsTransportCalculated,
  onInstallationTasksCalculated
}) => {
  const { t } = useTranslation(['calculator', 'utilities', 'common']);
  // Slab dimensions options
  const slabDimensions: SlabDimension[] = [
    { size: '90x60', width: 90, length: 60 },
    { size: '60x60', width: 60, length: 60 },
    { size: '60x30', width: 60, length: 30 },
    { size: '30x30', width: 30, length: 30 },
  ];

  // Slab placement options
  const slabPlacementOptions = [
    { id: 'longWay', label: 'Slabs long way' },
    { id: 'sideWays', label: 'Slabs side ways' },
  ];

  // Cutting options
  const cuttingOptions: SlabCuttingOption[] = [
    { type: 'oneCut', description: '1 cut' },
    { type: 'twoCuts', description: '2 cuts (same on both sizes)' },
  ];

  // State variables
  const [selectedSlabDimension, setSelectedSlabDimension] = useState<string>(slabDimensions[0].size);
  const [selectedPlacement, setSelectedPlacement] = useState<string>('longWay');
  const [selectedCutting, setSelectedCutting] = useState<string>('oneCut');
  const [adhesiveThickness, setAdhesiveThickness] = useState<string>('0.5');
  const [slabCalculationResult, setSlabCalculationResult] = useState<any>(null);
  const [wasteMaterials, setWasteMaterials] = useState<WasteMaterial[]>([]);
  const [adhesiveMaterials, setAdhesiveMaterials] = useState<any[]>([]);

  // Helper function to check if a cut is needed
  const needsCut = (actualDimension: number, requiredDimension: number): boolean => {
    return Math.abs(actualDimension - requiredDimension) > 0.1;
  };

  // Calculate slabs needed when stair result changes
  useEffect(() => {
    if (stairResult) {
      calculateSlabs();
    }
  }, [stairResult, selectedSlabDimension, selectedPlacement, gapBetweenSlabs, selectedCutting, adhesiveThickness, stepConfig, stepTreadInput]);

  const calculateSlabs = () => {
    if (!stairResult || !selectedSlabDimension) return;

    // Find the selected slab dimension
    const selectedSlab = slabDimensions.find(slab => slab.size === selectedSlabDimension);
    if (!selectedSlab) return;

    let totalStepSlabs = 0;
    let totalFrontSlabs = 0;
    let totalCuts = 0;
    let totalTopSurfaceArea = 0; // in mÂ²
    let totalFrontSurfaceArea = 0; // in mÂ²
    const stepResults = [];
    const wasteList: WasteMaterial[] = [];
    
    // Track cuts for callback
    const lengthCutsMap = new Map<number, number>(); // dimension -> count
    const widthCutsMap = new Map<number, number>();  // dimension -> count
    
    // Track slab dimensions for installation task matching
    const slabDimensionsMap = new Map<string, number>(); // "widthxlength" -> count
    
    // Helper function to track cuts
    const trackCut = (dimension: number, type: 'length' | 'width', count: number = 1) => {
      const map = type === 'length' ? lengthCutsMap : widthCutsMap;
      
      // Round to nearest standard size (30, 60, 90, 120)
      const standardSizes = [30, 60, 90, 120];
      let closestSize = standardSizes[0];
      let minDiff = Math.abs(standardSizes[0] - dimension);
      
      for (const size of standardSizes) {
        const diff = Math.abs(size - dimension);
        if (diff < minDiff) {
          minDiff = diff;
          closestSize = size;
        }
      }
      
      map.set(closestSize, (map.get(closestSize) || 0) + count);
    };
    
    // Helper function to track surface area
    const trackSurfaceArea = (width: number, length: number, type: 'top' | 'front', count: number = 1) => {
      // Convert cmÂ² to mÂ² (1 mÂ² = 10000 cmÂ²)
      const surfaceArea = (width * length / 10000) * count;
      if (type === 'top') {
        totalTopSurfaceArea += surfaceArea;
      } else {
        totalFrontSurfaceArea += surfaceArea;
      }
    };
    
    // Helper function to track slab dimensions for installation tasks
    const trackSlabDimension = (width: number, length: number, count: number = 1) => {
      const key = `${Math.round(width)}x${Math.round(length)}`;
      slabDimensionsMap.set(key, (slabDimensionsMap.get(key) || 0) + count);
    };
    
    
    // For each step in the stair result
    for (let i = 0; i < stairResult.totalSteps; i++) {
      const stepDimension = stairResult.stepDimensions[i];
      
      // Top slab depth depends on stepConfig (frontsOnTop vs stepsToFronts)
      const isLastStep = i === stairResult.totalSteps - 1;
      const gapCm = (gapBetweenSlabs ?? 2) / 10;
      let topSlabDepth: number;
      if (stepConfig === 'frontsOnTop') {
        topSlabDepth = isLastStep
          ? stepTreadInput - gapCm
          : stepTreadInput + (slabThicknessFront ?? 0) - 0.5;
      } else {
        topSlabDepth = stepTreadInput - gapCm;
      }
      
      // Get the total width of the step - use the totalWidth from input if available
      const totalWidth = stairResult.totalWidth || 300; // Using 300 as example
      
      // Use side overhang from input
      const sideOverhang = stairResult.sideOverhang || 0;
      
      // Calculate gaps - only between slabs, not on edges
      const gapSize = (gapBetweenSlabs ?? 2) / 10; // Convert mm to cm
      const slabsNeededWithoutGaps = Math.ceil(totalWidth / selectedSlab.width);
      const totalGaps = (slabsNeededWithoutGaps - 1) * gapSize;
      
      // Calculate slabs for the step (horizontal part)
      let stepSlabsNeeded = 0;
      let stepSlabsLength = 0;
      let stepNeedsCutting = false;
      let stepCutLength = 0;
      let stepSlabDimensions = '';
      let stepWasteUsed = false;
      let stepWasteSource = '';
      let newSlabsNeeded = 0;
      
      // Determine which dimension to use based on placement
      let slabWidth, slabLength;
      if (selectedPlacement === 'longWay') {
        // Use the longer dimension along the width
        slabWidth = Math.max(selectedSlab.width, selectedSlab.length);
        slabLength = Math.min(selectedSlab.width, selectedSlab.length);
      } else {
        // Use the shorter dimension along the width
        slabWidth = Math.min(selectedSlab.width, selectedSlab.length);
        slabLength = Math.max(selectedSlab.width, selectedSlab.length);
      }
      
      // Find all usable waste pieces for this step
      const usableWastePieces = wasteList.filter(waste => {
        const fitsNormal = waste.width >= topSlabDepth && waste.length >= totalWidth;
        const fitsRotated = waste.length >= topSlabDepth && waste.width >= totalWidth;
        // Both dimensions must be useful (> 1cm) - filter out gap trimmings like 90x0.2
        const bothUseful = waste.width > 1 && waste.length > 1;
        return (fitsNormal || fitsRotated) && bothUseful;
      });
      
      // Sort waste pieces by size to use smallest suitable piece first
      if (usableWastePieces.length > 0) {
        usableWastePieces.sort((a, b) => {
          const aArea = a.width * a.length;
          const bArea = b.width * b.length;
          return aArea - bArea;
        });
        
        // We can use waste material
        const selectedWaste = usableWastePieces[0];
        
        // Check if waste piece can cover full width
        if (selectedWaste.length >= totalWidth || selectedWaste.width >= totalWidth) {
          stepSlabsNeeded = 0;  // Using waste, so no new slabs needed
          newSlabsNeeded = 0;
          stepWasteUsed = true;
          stepWasteSource = selectedWaste.source;
          
          // Check if we need to rotate the waste piece
          const needsRotation = selectedWaste.width < topSlabDepth && selectedWaste.length >= topSlabDepth;
          
          if (needsRotation) {
            stepSlabDimensions = `1x(${totalWidth.toFixed(1)}x${topSlabDepth.toFixed(1)}cm) [Using rotated waste from ${stepWasteSource}]`;
          } else {
            stepSlabDimensions = `1x(${totalWidth.toFixed(1)}x${topSlabDepth.toFixed(1)}cm) [Using waste from ${stepWasteSource}]`;
          }
          
          // Track slab dimension for installation task matching
          trackSlabDimension(totalWidth, topSlabDepth, 1);
          
          // Remove the used waste from the list
          const wasteIndex = wasteList.indexOf(selectedWaste);
          if (wasteIndex > -1) wasteList.splice(wasteIndex, 1);
          
          // If we cut this piece, add remaining as waste
          if (selectedWaste.length > totalWidth) {
            wasteList.push({
              width: selectedWaste.width,
              length: selectedWaste.length - totalWidth,
              source: `Remaining from ${stepWasteSource}`,
              canBeRotated: true
            });
          }
          
          // Add this new code to count matching pieces
          const matchingPieces = wasteList.filter(waste => 
            waste.width === selectedWaste.width && 
            waste.length === selectedWaste.length && 
            waste.source === selectedWaste.source
          );
          const piecesCount = matchingPieces.length;
          
          // Then modify only these lines:
          if (needsCut(selectedWaste.length, topSlabDepth)) {
            totalCuts += piecesCount; // Change from totalCuts += 1
          }
          if (needsCut(selectedWaste.width, totalWidth)) {
            totalCuts += piecesCount; // Change from totalCuts += 1
          }
        } else {
          // Waste piece can only cover part of the width
          const coveredWidth = Math.max(selectedWaste.width, selectedWaste.length);
          const remainingWidth = totalWidth - coveredWidth;
          
          // Check if we have another waste piece for remaining width
          const remainingWastePieces = wasteList.filter(waste => {
            if (waste === selectedWaste) return false;
            const fitsRemaining = (waste.width >= topSlabDepth && waste.length >= remainingWidth) ||
                                (waste.length >= topSlabDepth && waste.width >= remainingWidth);
            return fitsRemaining;
          });
          
          if (remainingWastePieces.length > 0) {
            // We can use two waste pieces
            stepSlabsNeeded = 0;  // Using waste, so no new slabs needed
            newSlabsNeeded = 0;
            stepWasteUsed = true;
            stepWasteSource = `${selectedWaste.source} and ${remainingWastePieces[0].source}`;
            
            stepSlabDimensions = `2x(${totalWidth.toFixed(1)}x${topSlabDepth.toFixed(1)}cm) [Using waste from ${stepWasteSource}]`;
            
            // Track slab dimensions for installation task matching
            trackSlabDimension(totalWidth, topSlabDepth, 2);
            
            // Remove both used waste pieces
            const wasteIndex1 = wasteList.indexOf(selectedWaste);
            const wasteIndex2 = wasteList.indexOf(remainingWastePieces[0]);
            if (wasteIndex1 > -1) wasteList.splice(wasteIndex1, 1);
            if (wasteIndex2 > -1) wasteList.splice(wasteIndex2, 1);
          }
        }
      } else {
        // Calculate gaps - only between slabs, not on edges
        const gapSize = gapBetweenSlabs / 10; // Convert mm to cm
        
        // Gap-aware formula: n slabs + (n-1) gaps cover n*(slabWidth+gapSize) - gapSize
        const slabsNeededWithoutGaps = Math.ceil((totalWidth + gapSize) / (slabWidth + gapSize));
        
        // Calculate total gaps
        const totalGaps = (slabsNeededWithoutGaps - 1) * gapSize;

        // Check if we need to cut the last slab
        if (totalWidth < (slabsNeededWithoutGaps * slabWidth) + totalGaps) {
          // We need to cut at least one slab
          stepNeedsCutting = true;
          
          if (selectedCutting === 'oneCut') {
            // 1 cut option: Use full slabs + one cut slab
            const fullSlabsCount = slabsNeededWithoutGaps - 1;
            const widthCoveredByFullSlabs = fullSlabsCount * slabWidth;
            const remainingWidth = totalWidth - widthCoveredByFullSlabs - totalGaps;
            
            // Guard: if remaining is negligible, treat as no cutting needed (exact fit)
            if (remainingWidth <= 0.1) {
              stepSlabsNeeded = slabsNeededWithoutGaps;
              newSlabsNeeded = stepSlabsNeeded;
              stepSlabDimensions = `${slabsNeededWithoutGaps}x(${slabWidth}x${topSlabDepth.toFixed(1)}cm)`;
              if (needsCut(slabLength, topSlabDepth)) {
                totalCuts += slabsNeededWithoutGaps;
                trackCut(topSlabDepth, 'length', slabsNeededWithoutGaps);
                trackCut(slabWidth, 'width', slabsNeededWithoutGaps);
                trackSurfaceArea(slabWidth, topSlabDepth, 'top', slabsNeededWithoutGaps);
                trackSlabDimension(slabWidth, topSlabDepth, slabsNeededWithoutGaps);
              }
            } else {
            stepSlabsNeeded = fullSlabsCount + 1;
            newSlabsNeeded = stepSlabsNeeded;
            stepCutLength = remainingWidth;
            totalCuts += 1;
            
            // Track the width cut for the remaining piece
            trackCut(stepCutLength, 'width', 1);
            
            // Add waste material to the list (only if cut piece actually exists and is smaller than slab)
            if (stepCutLength > 0.1 && stepCutLength < slabWidth) {
              // First slab waste
              wasteList.push({
                width: slabWidth,
                length: slabLength - topSlabDepth,
                source: `Step ${i+1}`,
                canBeRotated: true
              });
              // Second slab waste if we used two slabs
              if (fullSlabsCount > 0) {
                wasteList.push({
                  width: slabWidth,
                  length: slabLength - topSlabDepth,
                  source: `Step ${i+1}`,
                  canBeRotated: true
                });
              }
            }
            
            // Calculate dimensions - only show cut piece if width > 0.1
            if (fullSlabsCount > 0) {
              stepSlabDimensions = stepCutLength > 0.1
                ? `${fullSlabsCount}x(${slabWidth}x${topSlabDepth.toFixed(1)}cm) + 1x(${stepCutLength.toFixed(1)}x${topSlabDepth.toFixed(1)}cm)`
                : `${fullSlabsCount}x(${slabWidth}x${topSlabDepth.toFixed(1)}cm)`;
            } else {
              stepSlabDimensions = stepCutLength > 0.1
                ? `1x(${stepCutLength.toFixed(1)}x${topSlabDepth.toFixed(1)}cm)`
                : '';
            }
            
            // Count cuts with precise threshold
            if (needsCut(slabLength, topSlabDepth)) {
              totalCuts += fullSlabsCount; // Length cuts for full pieces
              totalCuts += fullSlabsCount; // Width cuts for full pieces
              totalCuts += 1; // Length cut for the cut piece
              
              // Track for callback - track actual tread dimension, not slabLength
              trackCut(topSlabDepth, 'length', fullSlabsCount + 1);
              trackCut(slabWidth, 'width', fullSlabsCount);
              
              // Track surface area for adhesive calculation - for top step
              trackSurfaceArea(slabWidth, topSlabDepth, 'top', fullSlabsCount);
              trackSurfaceArea(stepCutLength, topSlabDepth, 'top', 1);
              // Track slab dimensions for installation task matching
              trackSlabDimension(slabWidth, topSlabDepth, fullSlabsCount);
              trackSlabDimension(stepCutLength, topSlabDepth, 1);
            }
            
            if (needsCut(slabWidth, stepCutLength)) {
              totalCuts += 1; // Width cut for the cut piece
              
              // Track for callback
              trackCut(stepCutLength, 'width', 1);
            }
            
            // For full slabs, check if width cut is needed
            if (fullSlabsCount > 0 && needsCut(slabWidth, slabWidth)) {
              totalCuts += fullSlabsCount; // Width cuts for full slabs if needed
              
              // Track for callback
              trackCut(slabWidth, 'width', fullSlabsCount);
            }
            }
          } else {
            // 2 cuts option: Take one full slab off, add remaining width, divide into 2 equal pieces
            if (slabsNeededWithoutGaps > 1) {
              // We have at least one full slab to work with
              const fullSlabsCount = slabsNeededWithoutGaps - 2; // Remove 2 full slabs for cutting
              const widthCoveredByFullSlabs = fullSlabsCount * slabWidth;
              const remainingWidth = totalWidth - widthCoveredByFullSlabs - totalGaps;
              const equalPieceWidth = remainingWidth / 2;
              
              // Guard: if cut pieces negligible, treat as no cutting (use slabsNeededWithoutGaps - 1 full slabs)
              if (remainingWidth <= 0.1 || equalPieceWidth <= 0.1) {
                stepSlabsNeeded = Math.max(1, slabsNeededWithoutGaps - 1);
                newSlabsNeeded = stepSlabsNeeded;
                stepSlabDimensions = `${stepSlabsNeeded}x(${slabWidth}x${topSlabDepth.toFixed(1)}cm)`;
                if (needsCut(slabLength, topSlabDepth)) {
                  totalCuts += stepSlabsNeeded;
                  trackCut(topSlabDepth, 'length', stepSlabsNeeded);
                  trackCut(slabWidth, 'width', stepSlabsNeeded);
                  trackSurfaceArea(slabWidth, topSlabDepth, 'top', stepSlabsNeeded);
                  trackSlabDimension(slabWidth, topSlabDepth, stepSlabsNeeded);
                }
              } else {
              stepSlabsNeeded = fullSlabsCount + 2; // Full slabs + 2 cut pieces
              newSlabsNeeded = stepSlabsNeeded; // All new slabs needed
              totalCuts += 2;
              
              // Track width cuts for both pieces
              trackCut(equalPieceWidth, 'width', 2);
              
              // Add waste material to the list (only if cut pieces exist and are smaller than slab)
              if (equalPieceWidth > 0.1 && equalPieceWidth < slabWidth) {
                wasteList.push({
                  width: slabWidth,  // Keep original width
                  length: slabLength - topSlabDepth, // Subtract only the used length
                  source: `Step ${i+1}`,
                  canBeRotated: true
                });
              }
              
              if (fullSlabsCount > 0) {
                stepSlabDimensions = equalPieceWidth > 0.1
                  ? `${fullSlabsCount}x(${slabWidth}x${topSlabDepth.toFixed(1)}cm) + 2x(${equalPieceWidth.toFixed(1)}x${topSlabDepth.toFixed(1)}cm)`
                  : `${fullSlabsCount}x(${slabWidth}x${topSlabDepth.toFixed(1)}cm)`;
              } else {
                stepSlabDimensions = equalPieceWidth > 0.1
                  ? `2x(${equalPieceWidth.toFixed(1)}x${topSlabDepth.toFixed(1)}cm)`
                  : '';
              }
              
              // Count cuts with precise threshold
              if (needsCut(slabLength, topSlabDepth)) {
                totalCuts += fullSlabsCount; // Length cuts for full pieces
                totalCuts += fullSlabsCount; // Width cuts for full pieces
                totalCuts += 2; // Length cuts for the two cut pieces
                
                // Track for callback
                trackCut(topSlabDepth, 'length', fullSlabsCount + 2);
                trackCut(slabWidth, 'width', fullSlabsCount);
              }
              
              if (needsCut(slabWidth, equalPieceWidth)) {
                totalCuts += 2; // Width cuts for the two cut pieces
                
                // Track for callback
                trackCut(equalPieceWidth, 'width', 2);
                
                // Track surface area for adhesive calculation - for top step
                trackSurfaceArea(slabWidth, topSlabDepth, 'top', fullSlabsCount);
                trackSurfaceArea(equalPieceWidth, topSlabDepth, 'top', 2);
                // Track slab dimensions for installation task matching
                trackSlabDimension(slabWidth, topSlabDepth, fullSlabsCount);
                trackSlabDimension(equalPieceWidth, topSlabDepth, 2);
              }
              
              // For full slabs, check if width cut is needed
              if (fullSlabsCount > 0 && needsCut(slabWidth, slabWidth)) {
                totalCuts += fullSlabsCount; // Width cuts for full slabs if needed
                
                // Track for callback
                trackCut(slabWidth, 'width', fullSlabsCount);
              }
              }
            } else {
              // Only one slab needed, just cut it
              stepSlabsNeeded = 1;
              newSlabsNeeded = 1; // One new slab needed
              totalCuts += 1;
              
              // Track the width cut
              trackCut(totalWidth, 'width', 1);
              
              // Add waste material to the list
              wasteList.push({
                width: slabWidth,  // Keep original width
                length: slabLength - totalWidth, // Subtract only the used length
                source: `Step ${i+1}`,
                canBeRotated: true
              });
              
              stepSlabDimensions = `1x(${Math.max(0, totalWidth).toFixed(1)}x${topSlabDepth.toFixed(1)}cm)`;
            }
          }
        } else {
          // No cutting needed, all full slabs
          stepSlabsNeeded = slabsNeededWithoutGaps;
          newSlabsNeeded = stepSlabsNeeded; // All new slabs needed
          stepSlabDimensions = `${slabsNeededWithoutGaps}x(${slabWidth}x${topSlabDepth.toFixed(1)}cm)`;
        }
        
        stepSlabsLength = slabLength;
      }
      
      // Calculate slabs for the front (vertical part)
      let frontSlabsNeeded = 0;
      let frontSlabsLength = 0;
      let frontNeedsCutting = false;
      let frontCutLength = 0;
      let frontSlabDimensions = '';
      let frontWasteUsed = false;
      let frontWasteSource = '';
      let frontNewSlabsNeeded = 0;
      
      // Calculate the individual step height for this specific step (height difference from previous step)
      const previousStepHeight = i > 0 ? stairResult.stepDimensions[i - 1].height : 0;
      const currentStepHeight = stepDimension.height;
      const individualStepHeight = currentStepHeight - previousStepHeight;
      const effectiveFrontHeight = (stepConfig === 'frontsOnTop' && i > 0)
        ? Math.max(0, individualStepHeight - slabThicknessTop)
        : individualStepHeight;
      
      // Find all usable waste pieces for the front
      const usableFrontWastePieces = wasteList.filter(waste => {
        // One dimension must cover front height, the other must be useful (> 1cm) - filter out gap trimmings
        const fitsNormal = waste.width >= effectiveFrontHeight && waste.length > 1;
        const fitsRotated = waste.length >= effectiveFrontHeight && waste.width > 1;
        return fitsNormal || fitsRotated;
      });
      
      // For front waste pieces
      if (usableFrontWastePieces.length > 0) {
        const selectedWaste = usableFrontWastePieces[0];
        frontSlabsNeeded = 0;
        frontNewSlabsNeeded = 0;
        frontWasteUsed = true;
        frontWasteSource = selectedWaste.source;

        // Calculations based on totalWidth; overhangs only in display
        const gapSize = gapBetweenSlabs / 10; // Convert mm to cm
        const slabsNeededWithoutGaps = Math.ceil((totalWidth + gapSize) / (slabWidth + gapSize));
        const totalGaps = slabsNeededWithoutGaps > 0 ? (slabsNeededWithoutGaps - 1) * gapSize : 0;
        
        let mainPieceCount, smallerPieceCount, smallerPieceWidth;
        
        if (selectedCutting === 'oneCut') {
          mainPieceCount = slabsNeededWithoutGaps - 1;
          smallerPieceCount = 1;
          const widthCoveredByFullSlabs = mainPieceCount * slabWidth;
          smallerPieceWidth = totalWidth - widthCoveredByFullSlabs - totalGaps;
        } else {
          mainPieceCount = slabsNeededWithoutGaps - 2;
          smallerPieceCount = 2;
          const widthCoveredByFullSlabs = mainPieceCount * slabWidth;
          smallerPieceWidth = (totalWidth - widthCoveredByFullSlabs - totalGaps) / 2;
        }
        
        mainPieceCount = Math.max(0, mainPieceCount);
        
        // Display: first -overhang, last -overhang, single -2*overhang
        if (mainPieceCount > 0 && smallerPieceCount > 0) {
          const firstW = Math.max(0, slabWidth - sideOverhang);
          const lastW = Math.max(0, smallerPieceWidth - sideOverhang);
          const frontParts: string[] = [];
          if (firstW > 0) frontParts.push(`1x(${firstW.toFixed(1)}x${effectiveFrontHeight.toFixed(1)}cm)`);
          if (mainPieceCount > 1) frontParts.push(`${mainPieceCount - 1}x(${slabWidth}x${effectiveFrontHeight.toFixed(1)}cm)`);
          if (selectedCutting === 'twoCuts') {
            if (smallerPieceWidth > 0.1) frontParts.push(`2x(${smallerPieceWidth.toFixed(1)}x${effectiveFrontHeight.toFixed(1)}cm)`);
          } else {
            if (lastW > 0) frontParts.push(`1x(${lastW.toFixed(1)}x${effectiveFrontHeight.toFixed(1)}cm)`);
          }
          frontSlabDimensions = `${frontParts.join(' + ')} [Using waste from ${selectedWaste.source}]`;
          if (firstW > 0) trackSlabDimension(firstW, effectiveFrontHeight, 1);
          if (mainPieceCount > 1) trackSlabDimension(slabWidth, effectiveFrontHeight, mainPieceCount - 1);
          if (selectedCutting === 'twoCuts') {
            if (smallerPieceWidth > 0.1) trackSlabDimension(smallerPieceWidth, effectiveFrontHeight, smallerPieceCount);
          } else {
            if (lastW > 0) trackSlabDimension(lastW, effectiveFrontHeight, 1);
          }
        } else if (mainPieceCount > 0) {
          const firstW = Math.max(0, slabWidth - sideOverhang);
          const lastW = Math.max(0, slabWidth - sideOverhang);
          const frontParts: string[] = [];
          if (firstW > 0) frontParts.push(`1x(${firstW.toFixed(1)}x${effectiveFrontHeight.toFixed(1)}cm)`);
          if (mainPieceCount > 1) frontParts.push(`${mainPieceCount - 1}x(${slabWidth}x${effectiveFrontHeight.toFixed(1)}cm)`);
          if (lastW > 0 && mainPieceCount > 1) frontParts.push(`1x(${lastW.toFixed(1)}x${effectiveFrontHeight.toFixed(1)}cm)`);
          frontSlabDimensions = `${frontParts.join(' + ')} [Using waste from ${selectedWaste.source}]`;
          if (firstW > 0) trackSlabDimension(firstW, effectiveFrontHeight, 1);
          if (mainPieceCount > 1) trackSlabDimension(slabWidth, effectiveFrontHeight, mainPieceCount - 1);
        } else if (smallerPieceCount > 0) {
          if (smallerPieceCount === 1) {
            const singleW = Math.max(0, smallerPieceWidth - 2 * sideOverhang);
            frontSlabDimensions = singleW > 0 ? `1x(${singleW.toFixed(1)}x${effectiveFrontHeight.toFixed(1)}cm) [Using waste from ${selectedWaste.source}]` : '';
            if (singleW > 0) trackSlabDimension(singleW, effectiveFrontHeight, 1);
          } else {
            const firstCutW = Math.max(0, smallerPieceWidth - sideOverhang);
            const lastCutW = Math.max(0, smallerPieceWidth - sideOverhang);
            const parts: string[] = [];
            if (firstCutW > 0) parts.push(`1x(${firstCutW.toFixed(1)}x${effectiveFrontHeight.toFixed(1)}cm)`);
            if (lastCutW > 0) parts.push(`1x(${lastCutW.toFixed(1)}x${effectiveFrontHeight.toFixed(1)}cm)`);
            frontSlabDimensions = parts.length > 0 ? `${parts.join(' + ')} [Using waste from ${selectedWaste.source}]` : '';
            if (firstCutW > 0) trackSlabDimension(firstCutW, effectiveFrontHeight, 1);
            if (lastCutW > 0) trackSlabDimension(lastCutW, effectiveFrontHeight, 1);
          }
        }
        
        // Find all matching pieces
        const matchingPieces = wasteList.filter(waste => 
          waste.width === selectedWaste.width && 
          waste.length === selectedWaste.length && 
          waste.source === selectedWaste.source
        );
        
        const piecesCount = matchingPieces.length;
        
        for (let i = 0; i < piecesCount; i++) {
          const index = wasteList.findIndex(w => 
            w.width === selectedWaste.width && 
            w.length === selectedWaste.length && 
            w.source === selectedWaste.source
          );
          if (index > -1) wasteList.splice(index, 1);
        }
        
        if (needsCut(selectedWaste.length, effectiveFrontHeight)) {
          totalCuts += 1;
          trackCut(selectedWaste.length, 'length', 1);
        }
        
        if (needsCut(selectedWaste.width, totalWidth)) {
          totalCuts += 1;
          trackCut(totalWidth, 'width', 1);
        }
      } else {
        // Calculate gaps - only between slabs, not on edges
        const gapSize = gapBetweenSlabs / 10; // Convert mm to cm
        
        // Calculations based on totalWidth; overhangs only subtracted in display
        const slabsNeededWithoutGaps = Math.ceil((totalWidth + gapSize) / (slabWidth + gapSize));
        const totalGaps = slabsNeededWithoutGaps > 0 ? (slabsNeededWithoutGaps - 1) * gapSize : 0;

        if (totalWidth < (slabsNeededWithoutGaps * slabWidth) + totalGaps) {
          frontNeedsCutting = true;
          
          if (selectedCutting === 'oneCut') {
            const fullSlabsCount = slabsNeededWithoutGaps - 1;
            const widthCoveredByFullSlabs = fullSlabsCount * slabWidth;
            const remainingWidth = totalWidth - widthCoveredByFullSlabs - totalGaps;
            
            // Guard: if remaining is negligible, treat as exact fit
            if (remainingWidth <= 0.1) {
              frontSlabsNeeded = slabsNeededWithoutGaps;
              frontNewSlabsNeeded = frontSlabsNeeded;
              const firstW = Math.max(0, slabWidth - sideOverhang);
              const lastW = Math.max(0, slabWidth - sideOverhang);
              if (slabsNeededWithoutGaps === 1) {
                const sW = Math.max(0, slabWidth - 2 * sideOverhang);
                frontSlabDimensions = sW > 0 ? `1x(${sW.toFixed(1)}x${effectiveFrontHeight.toFixed(1)}cm)` : '';
                if (sW > 0) trackSlabDimension(sW, effectiveFrontHeight, 1);
              } else {
                const mid = slabsNeededWithoutGaps - 2;
                const fp: string[] = [];
                if (firstW > 0) fp.push(`1x(${firstW.toFixed(1)}x${effectiveFrontHeight.toFixed(1)}cm)`);
                if (mid > 0) fp.push(`${mid}x(${slabWidth}x${effectiveFrontHeight.toFixed(1)}cm)`);
                if (lastW > 0) fp.push(`1x(${lastW.toFixed(1)}x${effectiveFrontHeight.toFixed(1)}cm)`);
                frontSlabDimensions = fp.join(' + ');
                if (firstW > 0) trackSlabDimension(firstW, effectiveFrontHeight, 1);
                if (mid > 0) trackSlabDimension(slabWidth, effectiveFrontHeight, mid);
                if (lastW > 0) trackSlabDimension(lastW, effectiveFrontHeight, 1);
              }
            } else {
            
            frontSlabsNeeded = fullSlabsCount + 1;
            frontNewSlabsNeeded = frontSlabsNeeded;
            frontCutLength = remainingWidth;
            totalCuts += 1;
            
            if (frontCutLength > 0.1 && frontCutLength < slabWidth) {
              wasteList.push({
                width: slabWidth,
                length: slabLength - effectiveFrontHeight,
                source: `Step ${i+1}`,
                canBeRotated: true
              });
              if (fullSlabsCount > 0) {
                wasteList.push({
                  width: slabWidth,
                  length: slabLength - effectiveFrontHeight,
                  source: `Step ${i+1}`,
                  canBeRotated: true
                });
              }
            }
            
            // Display: first slab -overhang, middle full, last -overhang; single -2*overhang
            if (fullSlabsCount > 1) {
              const firstW = Math.max(0, slabWidth - sideOverhang);
              const lastW = Math.max(0, remainingWidth - sideOverhang);
              const mid = fullSlabsCount - 1;
              const frontParts: string[] = [];
              if (firstW > 0) frontParts.push(`1x(${firstW.toFixed(1)}x${effectiveFrontHeight.toFixed(1)}cm)`);
              if (mid > 0) frontParts.push(`${mid}x(${slabWidth}x${effectiveFrontHeight.toFixed(1)}cm)`);
              if (lastW > 0) frontParts.push(`1x(${lastW.toFixed(1)}x${effectiveFrontHeight.toFixed(1)}cm)`);
              frontSlabDimensions = frontParts.join(' + ');
            } else if (fullSlabsCount === 1) {
              const firstW = Math.max(0, slabWidth - sideOverhang);
              const lastW = Math.max(0, remainingWidth - sideOverhang);
              const parts: string[] = [];
              if (firstW > 0) parts.push(`1x(${firstW.toFixed(1)}x${effectiveFrontHeight.toFixed(1)}cm)`);
              if (lastW > 0) parts.push(`1x(${lastW.toFixed(1)}x${effectiveFrontHeight.toFixed(1)}cm)`);
              frontSlabDimensions = parts.join(' + ');
            } else {
              const singleSlabWidth = Math.max(0, totalWidth - 2 * sideOverhang);
              if (singleSlabWidth <= 0) {
                frontSlabsNeeded = 0;
                frontNewSlabsNeeded = 0;
                frontSlabDimensions = '';
                totalCuts -= 1;
              } else {
                frontSlabDimensions = `1x(${singleSlabWidth.toFixed(1)}x${effectiveFrontHeight.toFixed(1)}cm)`;
                if (needsCut(slabLength, effectiveFrontHeight)) {
                  trackCut(effectiveFrontHeight, 'length', 1);
                }
                trackCut(singleSlabWidth, 'width', 1);
                trackSurfaceArea(singleSlabWidth, effectiveFrontHeight, 'front', 1);
                trackSlabDimension(singleSlabWidth, effectiveFrontHeight, 1);
              }
            }
            
            if (fullSlabsCount > 0) {
              if (needsCut(slabLength, effectiveFrontHeight)) {
                totalCuts += fullSlabsCount;
                totalCuts += fullSlabsCount;
                totalCuts += 1;
                trackCut(effectiveFrontHeight, 'length', fullSlabsCount + 1);
                trackCut(slabWidth, 'width', fullSlabsCount);
                
                const firstPieceW = Math.max(0, slabWidth - sideOverhang);
                const lastPieceW = Math.max(0, remainingWidth - sideOverhang);
                if (firstPieceW > 0) {
                  trackSurfaceArea(firstPieceW, effectiveFrontHeight, 'front', 1);
                  trackSlabDimension(firstPieceW, effectiveFrontHeight, 1);
                }
                if (fullSlabsCount > 1) {
                  trackSurfaceArea(slabWidth, effectiveFrontHeight, 'front', fullSlabsCount - 1);
                  trackSlabDimension(slabWidth, effectiveFrontHeight, fullSlabsCount - 1);
                }
                if (lastPieceW > 0) {
                  trackSurfaceArea(lastPieceW, effectiveFrontHeight, 'front', 1);
                  trackSlabDimension(lastPieceW, effectiveFrontHeight, 1);
                }
              }
              
              if (needsCut(slabWidth, remainingWidth)) {
                totalCuts += 1;
                trackCut(remainingWidth, 'width', 1);
              }
            }
            
            if (fullSlabsCount > 0 && needsCut(slabWidth, slabWidth)) {
              totalCuts += 1;
              trackCut(slabWidth, 'width', fullSlabsCount);
            }
            }
          } else {
            // 2 cuts option
            if (slabsNeededWithoutGaps > 1) {
              const fullSlabsCount = slabsNeededWithoutGaps - 2;
              const widthCoveredByFullSlabs = fullSlabsCount * slabWidth;
              const remainingWidth = totalWidth - widthCoveredByFullSlabs - totalGaps;
              const equalPieceWidth = remainingWidth / 2;
              
              frontSlabsNeeded = fullSlabsCount + 2;
              frontNewSlabsNeeded = frontSlabsNeeded;
              totalCuts += 2;
              
              if (equalPieceWidth > 0.1 && equalPieceWidth < slabWidth) {
                wasteList.push({
                  width: slabWidth,
                  length: slabLength - effectiveFrontHeight,
                  source: `Step ${i+1}`,
                  canBeRotated: true
                });
              }
              
              // Display: first full -overhang, middles full, 2 cuts nominal (they're in the middle)
              // If no full slabs: first cut -overhang, last cut -overhang
              const twoCutParts: string[] = [];
              if (fullSlabsCount > 0) {
                const firstW = Math.max(0, slabWidth - sideOverhang);
                if (firstW > 0) twoCutParts.push(`1x(${firstW.toFixed(1)}x${effectiveFrontHeight.toFixed(1)}cm)`);
                if (fullSlabsCount > 1) twoCutParts.push(`${fullSlabsCount - 1}x(${slabWidth}x${effectiveFrontHeight.toFixed(1)}cm)`);
                if (equalPieceWidth > 0.1) twoCutParts.push(`1x(${equalPieceWidth.toFixed(1)}x${effectiveFrontHeight.toFixed(1)}cm)`);
                const lastCutW = Math.max(0, equalPieceWidth - sideOverhang);
                if (lastCutW > 0) twoCutParts.push(`1x(${lastCutW.toFixed(1)}x${effectiveFrontHeight.toFixed(1)}cm)`);
              } else {
                const firstCutW = Math.max(0, equalPieceWidth - sideOverhang);
                const lastCutW = Math.max(0, equalPieceWidth - sideOverhang);
                if (firstCutW > 0) twoCutParts.push(`1x(${firstCutW.toFixed(1)}x${effectiveFrontHeight.toFixed(1)}cm)`);
                if (lastCutW > 0) twoCutParts.push(`1x(${lastCutW.toFixed(1)}x${effectiveFrontHeight.toFixed(1)}cm)`);
              }
              frontSlabDimensions = twoCutParts.join(' + ');
              if (frontWasteUsed) frontSlabDimensions += ` [Using waste from ${frontWasteSource}]`;
              
              if (needsCut(slabLength, effectiveFrontHeight)) {
                totalCuts += fullSlabsCount;
                totalCuts += fullSlabsCount;
                totalCuts += 1;
                trackCut(effectiveFrontHeight, 'length', fullSlabsCount + 1);
                trackCut(slabWidth, 'width', fullSlabsCount);
              }
              
              if (needsCut(slabWidth, equalPieceWidth)) {
                totalCuts += 2;
                trackCut(equalPieceWidth, 'width', 2);
                trackSurfaceArea(slabWidth, effectiveFrontHeight, 'front', fullSlabsCount);
                trackSurfaceArea(equalPieceWidth, effectiveFrontHeight, 'front', 2);
                trackSlabDimension(slabWidth, effectiveFrontHeight, fullSlabsCount);
                trackSlabDimension(equalPieceWidth, effectiveFrontHeight, 2);
              }
              
              if (fullSlabsCount > 0 && needsCut(slabWidth, slabWidth)) {
                totalCuts += fullSlabsCount;
                trackCut(slabWidth, 'width', fullSlabsCount);
              }
            } else {
              const singleSlabWidth = Math.max(0, totalWidth - 2 * sideOverhang);
              frontSlabsNeeded = singleSlabWidth > 0 ? 1 : 0;
              frontNewSlabsNeeded = frontSlabsNeeded;
              if (singleSlabWidth > 0) {
                totalCuts += 1;
                trackCut(singleSlabWidth, 'width', 1);
                wasteList.push({
                  width: slabWidth,
                  length: slabLength - effectiveFrontHeight,
                  source: `Step ${i+1}`,
                  canBeRotated: true
                });
                frontSlabDimensions = `1x(${singleSlabWidth.toFixed(1)}x${effectiveFrontHeight.toFixed(1)}cm)`;
                trackSlabDimension(singleSlabWidth, effectiveFrontHeight, 1);
              } else {
                frontSlabDimensions = '';
              }
            }
          }
        } else {
          // No cutting needed - display with overhangs on first/last
          if (slabsNeededWithoutGaps === 1) {
            const sW = Math.max(0, slabWidth - 2 * sideOverhang);
            frontSlabDimensions = sW > 0 ? `1x(${sW.toFixed(1)}x${effectiveFrontHeight.toFixed(1)}cm)` : '';
            if (sW > 0) trackSlabDimension(sW, effectiveFrontHeight, 1);
          } else {
            const firstW = Math.max(0, slabWidth - sideOverhang);
            const lastW = Math.max(0, slabWidth - sideOverhang);
            const mid = slabsNeededWithoutGaps - 2;
            const fp: string[] = [];
            if (firstW > 0) fp.push(`1x(${firstW.toFixed(1)}x${effectiveFrontHeight.toFixed(1)}cm)`);
            if (mid > 0) fp.push(`${mid}x(${slabWidth}x${effectiveFrontHeight.toFixed(1)}cm)`);
            if (lastW > 0) fp.push(`1x(${lastW.toFixed(1)}x${effectiveFrontHeight.toFixed(1)}cm)`);
            frontSlabDimensions = fp.join(' + ');
            if (firstW > 0) trackSlabDimension(firstW, effectiveFrontHeight, 1);
            if (mid > 0) trackSlabDimension(slabWidth, effectiveFrontHeight, mid);
            if (lastW > 0) trackSlabDimension(lastW, effectiveFrontHeight, 1);
          }
          frontSlabsNeeded = slabsNeededWithoutGaps;
          frontNewSlabsNeeded = frontSlabsNeeded;
        }
        
        frontSlabsLength = slabLength;
      }
      
      // Update totals - only count NEW slabs needed, not waste pieces
      totalStepSlabs += newSlabsNeeded;
      totalFrontSlabs += frontNewSlabsNeeded;
      
      stepResults.push({
        step: i + 1,
        stepSlabsNeeded: newSlabsNeeded, // Only show NEW slabs needed
        stepSlabsLength,
        stepNeedsCutting,
        stepCutLength,
        stepTread: topSlabDepth,
        stepWasteUsed,
        stepWasteSource,
        frontSlabsNeeded: frontNewSlabsNeeded, // Only show NEW slabs needed
        frontSlabsLength,
        frontNeedsCutting,
        frontCutLength,
        stepHeight: individualStepHeight,
        effectiveFrontHeight,
        frontWasteUsed,
        frontWasteSource,
        totalWidth,
        stepSlabDimensions,
        frontSlabDimensions
      });
    }
    
    // Calculate adhesive needed (like in TileInstallation)
    // Adhesive consumption formula: thickness (cm) * 12 kg/mÂ² per cm
    const adhesiveThicknessNum = parseFloat(adhesiveThickness) || 0.5;
    const adhesiveConsumption = adhesiveThicknessNum * 12; // kg/mÂ²
    
    const topAdhesiveNeeded = totalTopSurfaceArea * adhesiveConsumption; // kg
    const frontAdhesiveNeeded = totalFrontSurfaceArea * adhesiveConsumption; // kg
    const totalAdhesiveNeeded = topAdhesiveNeeded + frontAdhesiveNeeded; // kg
    
    setSlabCalculationResult({
      stepResults,
      totalStepSlabs,
      totalFrontSlabs,
      totalSlabs: totalStepSlabs + totalFrontSlabs,
      totalCuts,
      wasteList,
      totalTopSurfaceArea,
      totalFrontSurfaceArea,
      topAdhesiveNeeded,
      frontAdhesiveNeeded,
      totalAdhesiveNeeded,
      slabDimensionsMap: Array.from(slabDimensionsMap.entries()).map(([dim, count]) => ({ dim, count })),
      calculateTransport,
      selectedTransportCarrier,
      transportDistance
    });
    
    setWasteMaterials(wasteList);
    
    // Call callback with cuts data
    if (onCutsCalculated) {
      const lengthCuts = Array.from(lengthCutsMap).map(([dimension, count]) => ({
        dimension,
        count
      }));
      const widthCuts = Array.from(widthCutsMap).map(([dimension, count]) => ({
        dimension,
        count
      }));
      
      onCutsCalculated({ lengthCuts, widthCuts });
    }
  };
  
  // Calculate adhesive materials when calculation result changes
  useEffect(() => {
    if (slabCalculationResult) {
      if (slabCalculationResult.totalAdhesiveNeeded > 0) {
      // For now, we'll assume a standard adhesive bag size of 20kg
      // In the future, this should fetch from the database like TileInstallation does
      const totalAdhesiveKg = slabCalculationResult.totalAdhesiveNeeded;
      const standardBagSize = 20; // kg
      const bagsNeeded = Math.max(1, Math.ceil(totalAdhesiveKg / standardBagSize));
      
      const materials = [
        {
          name: `Tile Adhesive`,
          amount: bagsNeeded,
          unit: `${standardBagSize}kg bags`
        }
      ];
      
      setAdhesiveMaterials(materials);
      
      // Call callback to pass to parent
      if (onAdhesiveMaterialsCalculated) {
        onAdhesiveMaterialsCalculated(materials);
      }
    }
    }
  }, [slabCalculationResult]);
  
  // Calculate slab transport time when calculation result changes
  useEffect(() => {
    if (calculateTransport && selectedTransportCarrier && slabCalculationResult) {
      const totalSlabs = slabCalculationResult.totalSlabs || 0;
      if (totalSlabs > 0) {
        // Assume wheelbarrow or carrier can carry 2-3 slabs per trip
        const slabsPerTrip = 2;
        const trips = Math.ceil(totalSlabs / slabsPerTrip);
        
        // Estimate 10 minutes per trip (loading + transport + unloading)
        const transportHours = (trips * 10) / 60;
        
        if (onSlabsTransportCalculated) {
          onSlabsTransportCalculated(transportHours);
        }
      }
    }
  }, [calculateTransport, selectedTransportCarrier, slabCalculationResult]);
  
  // Calculate installation tasks based on slab surfaces and task templates
  useEffect(() => {
    if (slabCalculationResult && taskTemplates.length > 0 && slabCalculationResult.slabDimensionsMap) {
      
      // Helper function to find closest match Tile Installation task
      const findClosestTileInstallationTask = (width: number, length: number) => {
        // Get all Tile Installation tasks
        const tileInstallationTasks = taskTemplates.filter((t: any) => 
          t.name.toLowerCase().startsWith('tile installation')
        );
        
        if (tileInstallationTasks.length === 0) {
          return null;
        }
        
        // Extract dimensions from task names (e.g., "Tile Installation 120 x 30")
        const tasksWithDimensions = tileInstallationTasks.map((task: any) => {
          const match = task.name.match(/(\d+)\s*x\s*(\d+)/i);
          if (match) {
            return {
              task,
              width: parseInt(match[1]),
              length: parseInt(match[2])
            };
          }
          return null;
        }).filter(Boolean);
        
        if (tasksWithDimensions.length === 0) {
          // Fallback to first Tile Installation task if no dimensions found
          return tileInstallationTasks[0];
        }
        
        // Find closest match by calculating distance
        let closestTask = tasksWithDimensions[0];
        let minDistance = Math.sqrt(
          Math.pow(closestTask.width - width, 2) + 
          Math.pow(closestTask.length - length, 2)
        );
        
        for (const taskWithDim of tasksWithDimensions) {
          const distance = Math.sqrt(
            Math.pow(taskWithDim.width - width, 2) + 
            Math.pow(taskWithDim.length - length, 2)
          );
          if (distance < minDistance) {
            minDistance = distance;
            closestTask = taskWithDim;
          }
        }
        
        return closestTask.task;
      };
      
      // Group slabs by their closest match task
      const taskGroups = new Map<string, { task: any; count: number }>();
      
      for (const dimEntry of slabCalculationResult.slabDimensionsMap) {
        const [width, length] = dimEntry.dim.split('x').map(Number);
        const closestTask = findClosestTileInstallationTask(width, length);
        
        if (closestTask) {
          const taskName = closestTask.name;
          if (taskGroups.has(taskName)) {
            taskGroups.get(taskName)!.count += dimEntry.count;
          } else {
            taskGroups.set(taskName, { task: closestTask, count: dimEntry.count });
          }
        }
      }
      
      // Create installation tasks from grouped data
      const installationTasks = [];
      for (const [taskName, group] of taskGroups) {
        if (group.count > 0) {
          const totalHours = group.count * (group.task.estimated_hours || 0.5);
          installationTasks.push({
            task: taskName,
            hours: totalHours,
            amount: group.count,
            unit: 'pieces'
          });
        }
      }
      
      if (installationTasks.length > 0 && onInstallationTasksCalculated) {
        onInstallationTasksCalculated(installationTasks);
      }
    }
  }, [slabCalculationResult, taskTemplates, slabType]);

  if (!stairResult) return null;

  return (
    <div className="mt-8 bg-gray-800 p-6 rounded-lg text-white">
      <h3 className="text-xl font-semibold text-white mb-4">{t('calculator:slab_requirements_for_stairs')}</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="space-y-4">
          <div>
            <h4 className="text-lg font-medium text-white mb-2">{t('calculator:slab_dimensions_label')}</h4>
            <div className="space-y-2">
              {slabDimensions.map((slab) => (
                <div key={slab.size} className="flex items-center">
                  <input
                    type="radio"
                    id={`slab-${slab.size}`}
                    checked={selectedSlabDimension === slab.size}
                    onChange={() => setSelectedSlabDimension(slab.size)}
                    className="h-4 w-4 text-blue-600 rounded"
                  />
                  <label htmlFor={`slab-${slab.size}`} className="ml-2 text-sm text-gray-300">
                    {slab.size} cm
                  </label>
                </div>
              ))}
            </div>
          </div>
          
          <div>
            <h4 className="text-lg font-medium text-white mb-2">{t('calculator:fronts_and_front_steps_label')}</h4>
            <div className="space-y-2">
              {slabPlacementOptions.map((option) => (
                <div key={option.id} className="flex items-center">
                  <input
                    type="radio"
                    id={`placement-${option.id}`}
                    checked={selectedPlacement === option.id}
                    onChange={() => setSelectedPlacement(option.id)}
                    className="h-4 w-4 text-blue-600 rounded"
                  />
                  <label htmlFor={`placement-${option.id}`} className="ml-2 text-sm text-gray-300">
                    {option.label}
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="space-y-4">
          <div>
            <h4 className="text-lg font-medium text-white mb-2">{t('calculator:adhesive_thickness_label')}</h4>
            <input
              type="number"
              value={adhesiveThickness}
              onChange={(e) => setAdhesiveThickness(e.target.value)}
              className="w-full p-2 border rounded bg-gray-700 text-white"
              placeholder="cm"
              min="0"
              step="0.1"
            />
            <p className="text-xs text-gray-400 mt-1">
              Consumption: {((parseFloat(adhesiveThickness) || 0.5) * 12).toFixed(1)} kg/mÂ²
            </p>
          </div>
          
          <div>
            <h4 className="text-lg font-medium text-white mb-2">{t('calculator:slab_cutting_long_ways_label')}</h4>
            <div className="space-y-2">
              {cuttingOptions.map((option) => (
                <div key={option.type} className="flex items-center">
                  <input
                    type="radio"
                    id={`cutting-${option.type}`}
                    checked={selectedCutting === option.type}
                    onChange={() => setSelectedCutting(option.type)}
                    className="h-4 w-4 text-blue-600 rounded"
                  />
                  <label htmlFor={`cutting-${option.type}`} className="ml-2 text-sm text-gray-300">
                    {option.description}
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      {slabCalculationResult && (
        <div>
          <h4 className="text-lg font-medium text-white mb-3">{t('calculator:slab_details_label')}</h4>
          <div className="overflow-x-auto border border-gray-700 rounded-lg">
            <table className="w-full bg-gray-700 rounded-lg text-sm">
              <thead>
                <tr className="border-b border-gray-600">
                  <th className="py-2 px-3 text-left text-gray-300">Step</th>
                  <th className="py-2 px-3 text-left text-gray-300">Surface</th>
                  <th className="py-2 px-3 text-left text-gray-300">{t('calculator:slabs_needed')}</th>
                  <th className="py-2 px-3 text-left text-gray-300">Dimensions</th>
                  <th className="py-2 px-3 text-left text-gray-300">Surface Size (cm)</th>
                </tr>
              </thead>
              <tbody>
                {slabCalculationResult.stepResults.map((result: any) => (
                  <React.Fragment key={`step-${result.step}`}>
                    <tr className="border-b border-gray-600">
                      <td className="py-2 px-3 text-gray-300" rowSpan={2}>{result.step}</td>
                      <td className="py-2 px-3 text-gray-300">Top</td>
                      <td className="py-2 px-3 text-gray-300">{result.stepSlabsNeeded}</td>
                      <td className="py-2 px-3">
                        {[{ text: result.stepSlabDimensions, fromWaste: result.stepWasteUsed }].map((part, pi) => (
                          <span key={pi} className={part.fromWaste ? '!text-green-400' : ''}>{part.text}</span>
                        ))}
                      </td>
                      <td className="py-2 px-3 text-gray-400">
                        {result.totalWidth?.toFixed(1) ?? '-'} × {result.stepTread?.toFixed(1) ?? '-'}
                      </td>
                    </tr>
                    <tr className="border-b border-gray-600">
                      <td className="py-2 px-3 text-gray-300">Front</td>
                      <td className="py-2 px-3 text-gray-300">{result.frontSlabsNeeded}</td>
                      <td className="py-2 px-3">
                        {[{ text: result.frontSlabDimensions, fromWaste: result.frontWasteUsed }].map((part, pi) => (
                          <span key={pi} className={part.fromWaste ? '!text-green-400' : ''}>{part.text}</span>
                        ))}
                      </td>
                      <td className="py-2 px-3 text-gray-400">
                        {result.totalWidth?.toFixed(1) ?? '-'} × {result.effectiveFrontHeight?.toFixed(1) ?? '-'}
                      </td>
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-700 p-4 rounded">
              <h5 className="font-medium mb-2">{t('calculator:total_step_slabs_needed_label')}</h5>
              <p className="text-xl">{slabCalculationResult.totalStepSlabs}</p>
            </div>
            <div className="bg-gray-700 p-4 rounded">
              <h5 className="font-medium mb-2">{t('calculator:total_front_slabs_needed_label')}</h5>
              <p className="text-xl">{slabCalculationResult.totalFrontSlabs}</p>
            </div>
          </div>
          
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-700 p-4 rounded">
              <h5 className="font-medium mb-2">{t('calculator:total_slabs_needed_label')}</h5>
              <p className="text-xl">{slabCalculationResult.totalSlabs}</p>
            </div>
            <div className="bg-gray-700 p-4 rounded">
              <h5 className="font-medium mb-2">{t('calculator:total_cuts_required_label')}</h5>
              <p className="text-xl">{slabCalculationResult.totalCuts}</p>
            </div>
          </div>
          
          {wasteMaterials.length > 0 && (
            <div className="mt-6">
              <h4 className="text-lg font-medium text-white mb-3">{t('calculator:waste_material_available_for_reuse_label')}</h4>
              <div className="overflow-x-auto border border-gray-700 rounded-lg">
                <table className="w-full table-fixed bg-gray-700 rounded-lg">
                  <thead>
                    <tr className="border-b border-gray-600">
                      <th className="py-2 px-4 text-left text-gray-300">Source</th>
                      <th className="py-2 px-4 text-left text-gray-300">Dimensions</th>
                      <th className="py-2 px-4 text-left text-gray-300">{t('calculator:can_be_rotated')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wasteMaterials.map((waste, index) => (
                      <tr key={`waste-${index}`} className={index % 2 === 0 ? "bg-gray-750" : "bg-gray-700"}>
                        <td className="py-2 px-4 border-t border-gray-600">{waste.source}</td>
                        <td className="py-2 px-4 border-t border-gray-600">
                          {waste.width.toFixed(1)}x{waste.length.toFixed(1)}cm
                        </td>
                        <td className="py-2 px-4 border-t border-gray-600">
                          {waste.canBeRotated ? t('calculator:yes_label') : t('calculator:no_label')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StandardStairsSlabs;
