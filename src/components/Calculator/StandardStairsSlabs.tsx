import React, { useState, useEffect } from 'react';

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

interface StandardStairsSlabsProps {
  stairResult: StairResult | null;
}

const StandardStairsSlabs: React.FC<StandardStairsSlabsProps> = ({ stairResult }) => {
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

  // Gap options
  const gapOptions: SlabGapOption[] = [
    { value: 2, label: '2mm' },
    { value: 3, label: '3mm' },
    { value: 4, label: '4mm' },
    { value: 5, label: '5mm' },
  ];

  // Cutting options
  const cuttingOptions: SlabCuttingOption[] = [
    { type: 'oneCut', description: '1 cut' },
    { type: 'twoCuts', description: '2 cuts (same on both sizes)' },
  ];

  // State variables
  const [selectedSlabDimension, setSelectedSlabDimension] = useState<string>(slabDimensions[0].size);
  const [selectedPlacement, setSelectedPlacement] = useState<string>('longWay');
  const [selectedGap, setSelectedGap] = useState<number>(2);
  const [selectedCutting, setSelectedCutting] = useState<string>('oneCut');
  const [slabCalculationResult, setSlabCalculationResult] = useState<any>(null);
  const [wasteMaterials, setWasteMaterials] = useState<WasteMaterial[]>([]);
  const [transportDistance, setTransportDistance] = useState<string>('30');

  // Helper function to check if a cut is needed
  const needsCut = (actualDimension: number, requiredDimension: number): boolean => {
    return Math.abs(actualDimension - requiredDimension) > 0.1;
  };

  // Calculate slabs needed when stair result changes
  useEffect(() => {
    if (stairResult) {
      calculateSlabs();
    }
  }, [stairResult, selectedSlabDimension, selectedPlacement, selectedGap, selectedCutting]);

  const calculateSlabs = () => {
    if (!stairResult || !selectedSlabDimension) return;

    // Find the selected slab dimension
    const selectedSlab = slabDimensions.find(slab => slab.size === selectedSlabDimension);
    if (!selectedSlab) return;

    let totalStepSlabs = 0;
    let totalFrontSlabs = 0;
    let totalCuts = 0;
    const stepResults = [];
    const wasteList: WasteMaterial[] = [];
    
    // For each step in the stair result
    for (let i = 0; i < stairResult.totalSteps; i++) {
      const stepDimension = stairResult.stepDimensions[i];
      
      // Get the total width of the step - use the totalWidth from input if available
      const totalWidth = stairResult.totalWidth || 300; // Using 300 as example
      console.log('INITIAL VALUES:', {
        totalWidth,
        sideOverhang: stairResult.sideOverhang,
        slabWidth: selectedSlab.width,
        selectedCutting
      });
      
      // Use side overhang from input
      const sideOverhang = stairResult.sideOverhang || 0;
      console.log('Side Overhang:', sideOverhang);
      
      // Calculate gaps - only between slabs, not on edges
      const gapSize = selectedGap / 10; // Convert mm to cm
      const slabsNeededWithoutGaps = Math.ceil(totalWidth / selectedSlab.width);
      const totalGaps = (slabsNeededWithoutGaps - 1) * gapSize;

      console.log('AFTER GAP CALCULATIONS:', {
        gapSize,
        slabsNeededWithoutGaps,
        totalGaps,
        calculation: `(${slabsNeededWithoutGaps} - 1) * ${gapSize} = ${totalGaps}`
      });
      
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
        // Check if waste fits in normal orientation (only need to cover tread depth)
        const fitsNormal = waste.width >= stepDimension.tread;
        
        // Check if waste fits when rotated (only need to cover height)
        const fitsRotated = waste.length >= stepDimension.tread;
        
        // Also check if width or length can cover the front width
        const canCoverWidth = waste.width >= totalWidth || waste.length >= totalWidth;
        
        return (fitsNormal || fitsRotated) && canCoverWidth;
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
          const needsRotation = selectedWaste.width < stepDimension.tread && selectedWaste.length >= stepDimension.tread;
          
          if (needsRotation) {
            stepSlabDimensions = `1x(${totalWidth.toFixed(1)}x${stepDimension.tread.toFixed(1)}cm) [Using rotated waste from ${stepWasteSource}]`;
          } else {
            stepSlabDimensions = `1x(${totalWidth.toFixed(1)}x${stepDimension.tread.toFixed(1)}cm) [Using waste from ${stepWasteSource}]`;
          }
          
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
          if (needsCut(selectedWaste.length, stepDimension.tread)) {
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
            const fitsRemaining = (waste.width >= stepDimension.tread && waste.length >= remainingWidth) ||
                                (waste.length >= stepDimension.tread && waste.width >= remainingWidth);
            return fitsRemaining;
          });
          
          if (remainingWastePieces.length > 0) {
            // We can use two waste pieces
            stepSlabsNeeded = 0;  // Using waste, so no new slabs needed
            newSlabsNeeded = 0;
            stepWasteUsed = true;
            stepWasteSource = `${selectedWaste.source} and ${remainingWastePieces[0].source}`;
            
            stepSlabDimensions = `2x(${totalWidth.toFixed(1)}x${stepDimension.tread.toFixed(1)}cm) [Using waste from ${stepWasteSource}]`;
            
            // Remove both used waste pieces
            const wasteIndex1 = wasteList.indexOf(selectedWaste);
            const wasteIndex2 = wasteList.indexOf(remainingWastePieces[0]);
            if (wasteIndex1 > -1) wasteList.splice(wasteIndex1, 1);
            if (wasteIndex2 > -1) wasteList.splice(wasteIndex2, 1);
          }
        }
      } else {
        // Calculate gaps - only between slabs, not on edges
        const gapSize = selectedGap / 10; // Convert mm to cm
        
        // Calculate how many slabs we need without considering gaps
        const slabsNeededWithoutGaps = Math.ceil(totalWidth / slabWidth);
        
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
            
            // CRITICAL CHECK - which width are we using?
            console.log('CRITICAL CHECK - Width variables:', {
              totalWidth,
              actualCalculation: {
                widthForRemaining: totalWidth,
                widthCoveredByFullSlabs,
                totalGaps,
                calculatedRemaining: totalWidth - widthCoveredByFullSlabs - totalGaps
              }
            });

            // If we have side overhang, subtract one overhang from remaining width
            // since we'll handle one side with a special cut
            let remainingWidth;
            let overhangNote = '';
            if (sideOverhang > 0) {
              // For remaining width, subtract one overhang since we'll handle one side separately
              remainingWidth = totalWidth - widthCoveredByFullSlabs - totalGaps - sideOverhang;
              overhangNote = ` [One side overhang cut]`;
            } else {
              remainingWidth = totalWidth - widthCoveredByFullSlabs - totalGaps;
            }
            
            console.log('TRACE - Initial values:', {
              totalWidth,
              sideOverhang,
              remainingWidth
            });

            console.log('TRACE - Slab calculations:', {
              slabWidth,
              fullSlabsCount,
              widthCoveredByFullSlabs,
              totalGaps,
              remainingWidth
            });
            
            stepSlabsNeeded = fullSlabsCount + 1;
            newSlabsNeeded = stepSlabsNeeded;
            stepCutLength = remainingWidth;
            totalCuts += 1;
            
            // Add waste material to the list
            if (stepCutLength < slabWidth) {
              // First slab waste
              wasteList.push({
                width: slabWidth,
                length: slabLength - stepDimension.tread,
                source: `Step ${i+1}`,
                canBeRotated: true
              });
              // Second slab waste if we used two slabs
              if (fullSlabsCount > 0) {
                wasteList.push({
                  width: slabWidth,
                  length: slabLength - stepDimension.tread,
                  source: `Step ${i+1}`,
                  canBeRotated: true
                });
              }
            }
            
            // Calculate dimensions for each slab
            console.log('Debug - Before dimension string:', {
              fullSlabsCount,
              slabWidth,
              tread: stepDimension.tread,
              stepCutLength,
              totalGaps,
              totalWidth
            });

            if (fullSlabsCount > 0) {
              if (sideOverhang > 0) {
                // One slab gets the overhang cut, rest are full width
                const normalFullSlabs = fullSlabsCount - 1;
                const overhangCutSlabWidth = slabWidth - sideOverhang;
                
                if (normalFullSlabs > 0) {
                  stepSlabDimensions = `1x(${overhangCutSlabWidth.toFixed(1)}x${stepDimension.tread.toFixed(1)}cm) + ${normalFullSlabs}x(${slabWidth}x${stepDimension.tread.toFixed(1)}cm) + 1x(${Math.max(0, stepCutLength).toFixed(1)}x${stepDimension.tread.toFixed(1)}cm)${overhangNote}`;
                } else {
                  stepSlabDimensions = `1x(${overhangCutSlabWidth.toFixed(1)}x${stepDimension.tread.toFixed(1)}cm) + 1x(${Math.max(0, stepCutLength).toFixed(1)}x${stepDimension.tread.toFixed(1)}cm)${overhangNote}`;
                }
              } else {
              stepSlabDimensions = `${fullSlabsCount}x(${slabWidth}x${stepDimension.tread.toFixed(1)}cm) + 1x(${Math.max(0, stepCutLength).toFixed(1)}x${stepDimension.tread.toFixed(1)}cm)`;
              }
            } else {
              stepSlabDimensions = `1x(${Math.max(0, stepCutLength).toFixed(1)}x${stepDimension.tread.toFixed(1)}cm)`;
            }
            
            // Count cuts with precise threshold
            if (needsCut(slabLength, stepDimension.tread)) {
              totalCuts += fullSlabsCount; // Length cuts for full pieces
              totalCuts += fullSlabsCount; // Width cuts for full pieces
              totalCuts += 1; // Length cut for the cut piece
            }
            
            if (needsCut(slabWidth, stepCutLength)) {
              totalCuts += 1; // Width cut for the cut piece
            }
            
            // For full slabs, check if width cut is needed
            if (fullSlabsCount > 0 && needsCut(slabWidth, slabWidth)) {
              totalCuts += fullSlabsCount; // Width cuts for full slabs if needed
            }
          } else {
            // 2 cuts option: Take one full slab off, add remaining width, divide into 2 equal pieces
            if (slabsNeededWithoutGaps > 1) {
              // We have at least one full slab to work with
              const fullSlabsCount = slabsNeededWithoutGaps - 2; // Remove 2 full slabs for cutting
              const widthCoveredByFullSlabs = fullSlabsCount * slabWidth;
              const remainingWidth = totalWidth - widthCoveredByFullSlabs - totalGaps;
              
              // For step slabs, we don't adjust for overhangs
              const equalPieceWidth = remainingWidth / 2;
              
              stepSlabsNeeded = fullSlabsCount + 2; // Full slabs + 2 cut pieces
              newSlabsNeeded = stepSlabsNeeded; // All new slabs needed
              totalCuts += 2;
              
              // Add waste material to the list (if any)
              if (equalPieceWidth < slabWidth) {
                wasteList.push({
                  width: slabWidth,  // Keep original width
                  length: slabLength - stepDimension.tread, // Subtract only the used length
                  source: `Step ${i+1}`,
                  canBeRotated: true
                });
              }
              
              if (fullSlabsCount > 0) {
                stepSlabDimensions = `${fullSlabsCount}x(${slabWidth}x${stepDimension.tread.toFixed(1)}cm) + 2x(${Math.max(0, equalPieceWidth).toFixed(1)}x${stepDimension.tread.toFixed(1)}cm)`;
              } else {
                stepSlabDimensions = `2x(${Math.max(0, equalPieceWidth).toFixed(1)}x${stepDimension.tread.toFixed(1)}cm)`;
              }
              
              // Count cuts with precise threshold
              if (needsCut(slabLength, stepDimension.tread)) {
                totalCuts += fullSlabsCount; // Length cuts for full pieces
                totalCuts += fullSlabsCount; // Width cuts for full pieces
                totalCuts += 2; // Length cuts for the two cut pieces
              }
              
              if (needsCut(slabWidth, equalPieceWidth)) {
                totalCuts += 2; // Width cuts for the two cut pieces
              }
              
              // For full slabs, check if width cut is needed
              if (fullSlabsCount > 0 && needsCut(slabWidth, slabWidth)) {
                totalCuts += fullSlabsCount; // Width cuts for full slabs if needed
              }
            } else {
              // Only one slab needed, just cut it
              stepSlabsNeeded = 1;
              newSlabsNeeded = 1; // One new slab needed
              totalCuts += 1;
              
              // Add waste material to the list
              wasteList.push({
                width: slabWidth,  // Keep original width
                length: slabLength - totalWidth, // Subtract only the used length
                source: `Step ${i+1}`,
                canBeRotated: true
              });
              
              stepSlabDimensions = `1x(${Math.max(0, totalWidth).toFixed(1)}x${stepDimension.tread.toFixed(1)}cm)`;
            }
          }
        } else {
          // No cutting needed, all full slabs
          stepSlabsNeeded = slabsNeededWithoutGaps;
          newSlabsNeeded = stepSlabsNeeded; // All new slabs needed
          stepSlabDimensions = `${slabsNeededWithoutGaps}x(${slabWidth}x${stepDimension.tread.toFixed(1)}cm)`;
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
      
      // Find all usable waste pieces for the front
      const usableFrontWastePieces = wasteList.filter(waste => {
        // Check if waste fits in normal orientation (only need to cover height)
        const fitsNormal = waste.width >= individualStepHeight;
        
        // Check if waste fits when rotated (only need to cover height)
        const fitsRotated = waste.length >= individualStepHeight;
        
        return fitsNormal || fitsRotated;
      });
      
      // For front waste pieces
      if (usableFrontWastePieces.length > 0) {
        const selectedWaste = usableFrontWastePieces[0];
        frontSlabsNeeded = 0;
        frontNewSlabsNeeded = 0;
        frontWasteUsed = true;
        frontWasteSource = selectedWaste.source;

        // Calculate how many slabs we need without considering gaps
        const slabsNeededWithoutGaps = Math.ceil(totalWidth / slabWidth);
        
        // Calculate total gaps
        const gapSize = selectedGap / 10; // Convert mm to cm
        const totalGaps = (slabsNeededWithoutGaps - 1) * gapSize;
        
        let mainPieceCount, smallerPieceCount, mainPieceWidth, smallerPieceWidth;
        
        if (selectedCutting === 'oneCut') {
          // 1 cut option: Use full slabs + one cut slab
          mainPieceCount = slabsNeededWithoutGaps - 1; // Full slabs
          smallerPieceCount = 1; // One cut slab
          
          // Calculate the width of the cut slab
          const widthCoveredByFullSlabs = mainPieceCount * slabWidth;
          smallerPieceWidth = totalWidth - widthCoveredByFullSlabs - totalGaps;
          mainPieceWidth = slabWidth;
        } else {
          // 2 cuts option: Full slabs + 2 equal cut pieces
          mainPieceCount = slabsNeededWithoutGaps - 2; // Full slabs
          smallerPieceCount = 2; // Two cut slabs
          
          // Calculate the width of the cut slabs
          const widthCoveredByFullSlabs = mainPieceCount * slabWidth;
          const remainingWidth = totalWidth - widthCoveredByFullSlabs - totalGaps;
          smallerPieceWidth = remainingWidth / 2;
          mainPieceWidth = slabWidth;
        }
        
        // Ensure counts are not negative
        mainPieceCount = Math.max(0, mainPieceCount);
        
        // Show separate counts for each piece type
        if (mainPieceCount > 0 && smallerPieceCount > 0) {
          frontSlabDimensions = `${mainPieceCount}x(${mainPieceWidth.toFixed(1)}x${individualStepHeight.toFixed(1)}cm) + ${smallerPieceCount}x(${smallerPieceWidth.toFixed(1)}x${individualStepHeight.toFixed(1)}cm) [Using waste from ${selectedWaste.source}]`;
        } else if (mainPieceCount > 0) {
          frontSlabDimensions = `${mainPieceCount}x(${mainPieceWidth.toFixed(1)}x${individualStepHeight.toFixed(1)}cm) [Using waste from ${selectedWaste.source}]`;
        } else if (smallerPieceCount > 0) {
          frontSlabDimensions = `${smallerPieceCount}x(${smallerPieceWidth.toFixed(1)}x${individualStepHeight.toFixed(1)}cm) [Using waste from ${selectedWaste.source}]`;
        }
        
        // Find all matching pieces
        const matchingPieces = wasteList.filter(waste => 
          waste.width === selectedWaste.width && 
          waste.length === selectedWaste.length && 
          waste.source === selectedWaste.source
        );
        
        // Get the actual count of pieces being used
        const piecesCount = matchingPieces.length;
        
        // Remove all matching pieces
        for (let i = 0; i < piecesCount; i++) {
          const index = wasteList.findIndex(w => 
            w.width === selectedWaste.width && 
            w.length === selectedWaste.length && 
            w.source === selectedWaste.source
          );
          if (index > -1) wasteList.splice(index, 1);
        }
        
        // Check if cuts are needed for waste pieces
        if (needsCut(selectedWaste.length, individualStepHeight)) {
          totalCuts += 1; // Length cut needed
        }
        
        if (needsCut(selectedWaste.width, totalWidth)) {
          totalCuts += 1; // Width cut needed
        }
      } else {
        // Calculate gaps - only between slabs, not on edges
        const gapSize = selectedGap / 10; // Convert mm to cm
        
        // Calculate how many slabs we need without considering gaps
        const slabsNeededWithoutGaps = Math.ceil(totalWidth / slabWidth);
        
        // Calculate total gaps
        const totalGaps = (slabsNeededWithoutGaps - 1) * gapSize;

        // Check if we need to cut the last slab
        if (totalWidth < (slabsNeededWithoutGaps * slabWidth) + totalGaps) {
          // We need to cut at least one slab
          frontNeedsCutting = true;
          
          if (selectedCutting === 'oneCut') {
            // 1 cut option: Use full slabs + one cut slab
            const fullSlabsCount = slabsNeededWithoutGaps - 1;
            const widthCoveredByFullSlabs = fullSlabsCount * slabWidth;
            
            // CRITICAL CHECK - which width are we using?
            console.log('CRITICAL CHECK - Width variables:', {
              totalWidth,
              actualCalculation: {
                widthForRemaining: totalWidth,
                widthCoveredByFullSlabs,
                totalGaps,
                calculatedRemaining: totalWidth - widthCoveredByFullSlabs - totalGaps
              }
            });

            const remainingWidth = totalWidth - widthCoveredByFullSlabs - totalGaps;
            
            console.log('TRACE - Initial values:', {
              totalWidth,
              sideOverhang
            });

            console.log('TRACE - Slab calculations:', {
              slabWidth,
              fullSlabsCount,
              widthCoveredByFullSlabs,
              totalGaps,
              remainingWidth
            });
            
            frontSlabsNeeded = fullSlabsCount + 1;
            frontNewSlabsNeeded = frontSlabsNeeded; // All new slabs needed
            frontCutLength = remainingWidth;
            totalCuts += 1;
            
            // Add waste material to the list
            if (frontCutLength < slabWidth) {
              // First slab waste
              wasteList.push({
                width: slabWidth,
                length: slabLength - individualStepHeight,
                source: `Step ${i+1}`,
                canBeRotated: true
              });
              // Second slab waste if we used two slabs
              if (fullSlabsCount > 0) {
                wasteList.push({
                  width: slabWidth,
                  length: slabLength - individualStepHeight,
                  source: `Step ${i+1}`,
                  canBeRotated: true
                });
              }
            }
            
            // Calculate dimensions for each slab
            console.log('Debug - Before dimension string:', {
              fullSlabsCount,
              slabWidth,
              tread: stepDimension.tread,
              stepCutLength,
              totalGaps,
              totalWidth
            });

            if (fullSlabsCount > 1) {
              // Multiple full slabs: first has overhang reduction, rest are full width
              const normalFullSlabs = fullSlabsCount - 1;
              const firstSlabWidth = slabWidth - sideOverhang;
              
              // Calculate remaining width for cut slab - just use what's left, no overhang subtraction
              const widthUsedByFullSlabs = firstSlabWidth + (normalFullSlabs * slabWidth);
              const remainingForCutSlab = totalWidth - widthUsedByFullSlabs - totalGaps;
              
              console.log('DIMENSION STRING CALCULATION:', {
                fullSlabsCount,
                normalFullSlabs,
                firstSlabWidth: `${slabWidth} - ${sideOverhang} = ${firstSlabWidth}`,
                widthUsedByFullSlabs,
                remainingForCutSlab,
                slabWidth,
                individualStepHeight
              });
              
              frontSlabDimensions = `1x(${firstSlabWidth.toFixed(1)}x${individualStepHeight.toFixed(1)}cm) + ${normalFullSlabs}x(${slabWidth.toFixed(1)}x${individualStepHeight.toFixed(1)}cm) + 1x(${Math.max(0, remainingForCutSlab).toFixed(1)}x${individualStepHeight.toFixed(1)}cm)`;
              console.log('FINAL DIMENSION STRING:', frontSlabDimensions);
            } else if (fullSlabsCount === 1) {
              // One full slab plus one cut slab
              const fullSlabWidth = slabWidth - sideOverhang;
              // Cut slab just gets whatever space is left
              const remainingForCutSlab = totalWidth - fullSlabWidth - totalGaps;
              frontSlabDimensions = `1x(${fullSlabWidth.toFixed(1)}x${individualStepHeight.toFixed(1)}cm) + 1x(${Math.max(0, remainingForCutSlab).toFixed(1)}x${individualStepHeight.toFixed(1)}cm)`;
            } else {
              // Only cut slab - use the full totalWidth since it already accounts for overhangs
              frontSlabDimensions = `1x(${Math.max(0, totalWidth).toFixed(1)}x${individualStepHeight.toFixed(1)}cm)`;
            }
            
            console.log('Debug - Final front dimensions:', frontSlabDimensions);
            
            // Count cuts with precise threshold
            if (needsCut(slabLength, individualStepHeight)) {
              totalCuts += fullSlabsCount; // Length cuts for full pieces
              totalCuts += fullSlabsCount; // Width cuts for full pieces
              totalCuts += 1; // Length cut for the cut piece
            }
            
            if (needsCut(slabWidth, frontCutLength)) {
              totalCuts += 1; // Width cut for the cut piece
            }
            
            // For full slabs, check if width cut is needed
            if (fullSlabsCount > 0 && needsCut(slabWidth, slabWidth)) {
              totalCuts += 1; // Width cut for the one adjusted full slab
            }
          } else {
            // 2 cuts option: Take one full slab off, add remaining width, divide into 2 equal pieces
            if (slabsNeededWithoutGaps > 1) {
              // We have at least one full slab to work with
              const fullSlabsCount = slabsNeededWithoutGaps - 2; // Remove 2 full slabs for cutting
              const widthCoveredByFullSlabs = fullSlabsCount * slabWidth;
              const remainingWidth = totalWidth - widthCoveredByFullSlabs - totalGaps;
              
              // For front slabs, we adjust for overhangs on both sides
              const adjustedRemainingWidth = remainingWidth - (2 * sideOverhang);
              
              // We'll make 2 equal pieces from the remaining width
              const equalPieceWidth = adjustedRemainingWidth / 2;
              
              frontSlabsNeeded = fullSlabsCount + 2; // Full slabs + 2 cut pieces
              frontNewSlabsNeeded = frontSlabsNeeded; // All new slabs needed
              totalCuts += 2;
              
              // Add waste material to the list (if any)
              if (equalPieceWidth < slabWidth) {
                wasteList.push({
                  width: slabWidth,  // Keep original width
                  length: slabLength - stepDimension.tread, // Subtract only the used length
                  source: `Step ${i+1}`,
                  canBeRotated: true
                });
              }
              
              if (frontWasteUsed) {
                frontSlabDimensions = `${fullSlabsCount}x(${slabWidth}x${individualStepHeight.toFixed(1)}cm) + 2x(${equalPieceWidth.toFixed(1)}x${individualStepHeight.toFixed(1)}cm) [Using waste from ${frontWasteSource}]`;
              } else {
                frontSlabDimensions = `${fullSlabsCount}x(${slabWidth}x${individualStepHeight.toFixed(1)}cm) + 2x(${equalPieceWidth.toFixed(1)}x${individualStepHeight.toFixed(1)}cm)`;
                frontSlabDimensions = `2x(${equalPieceWidth.toFixed(1)}x${individualStepHeight.toFixed(1)}cm)`;
              }
              
              // Add side overhang note if needed
              if (sideOverhang > 0) {
                frontSlabDimensions += " [Cut due to side overhang]";
              }
              
              // Count cuts with precise threshold
              if (needsCut(slabLength, individualStepHeight)) {
                totalCuts += fullSlabsCount; // Length cuts for full pieces
                totalCuts += fullSlabsCount; // Width cuts for full pieces
                totalCuts += 1; // Length cut for the cut piece
              }
              
              if (needsCut(slabWidth, equalPieceWidth)) {
                totalCuts += 2; // Width cuts for the two cut pieces
              }
              
              // For full slabs, check if width cut is needed
              if (fullSlabsCount > 0 && needsCut(slabWidth, slabWidth)) {
                totalCuts += fullSlabsCount; // Width cuts for full slabs if needed
              }
            } else {
              // Only one slab needed, just cut it
              frontSlabsNeeded = 1;
              frontNewSlabsNeeded = 1; // One new slab needed
              totalCuts += 1;
              
              // Add waste material to the list
              wasteList.push({
                width: slabWidth,  // Keep original width
                length: slabLength - totalWidth, // Subtract only the used length
                source: `Step ${i+1}`,
                canBeRotated: true
              });
              
              frontSlabDimensions = `1x(${Math.max(0, totalWidth).toFixed(1)}x${individualStepHeight.toFixed(1)}cm)`;
            }
          }
        } else {
          // No cutting needed, all full slabs
          frontSlabsNeeded = slabsNeededWithoutGaps;
          frontNewSlabsNeeded = frontSlabsNeeded; // All new slabs needed
          frontSlabDimensions = `${slabsNeededWithoutGaps}x(${slabWidth}x${individualStepHeight.toFixed(1)}cm)`;
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
        stepTread: stepDimension.tread,
        stepWasteUsed,
        stepWasteSource,
        frontSlabsNeeded: frontNewSlabsNeeded, // Only show NEW slabs needed
        frontSlabsLength,
        frontNeedsCutting,
        frontCutLength,
        stepHeight: individualStepHeight,
        frontWasteUsed,
        frontWasteSource,
        totalWidth,
        stepSlabDimensions,
        frontSlabDimensions
      });
    }
    
    setSlabCalculationResult({
      stepResults,
      totalStepSlabs,
      totalFrontSlabs,
      totalSlabs: totalStepSlabs + totalFrontSlabs,
      totalCuts,
      wasteList
    });
    
    setWasteMaterials(wasteList);
  };

  if (!stairResult) return null;

  return (
    <div className="mt-8 bg-gray-800 p-6 rounded-lg text-white">
      <h3 className="text-xl font-semibold text-white mb-4">Slab Requirements for Stairs</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="space-y-4">
          <div>
            <h4 className="text-lg font-medium text-white mb-2">Slab Dimensions</h4>
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
            <h4 className="text-lg font-medium text-white mb-2">Fronts and Front Steps</h4>
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
            <h4 className="text-lg font-medium text-white mb-2">Gap</h4>
            <div className="space-y-2">
              {gapOptions.map((gap) => (
                <div key={gap.value} className="flex items-center">
                  <input
                    type="radio"
                    id={`gap-${gap.value}`}
                    checked={selectedGap === gap.value}
                    onChange={() => setSelectedGap(gap.value)}
                    className="h-4 w-4 text-blue-600 rounded"
                  />
                  <label htmlFor={`gap-${gap.value}`} className="ml-2 text-sm text-gray-300">
                    {gap.label}
                  </label>
                </div>
              ))}
            </div>
          </div>
          
          <div>
            <h4 className="text-lg font-medium text-white mb-2">Slab Cutting (long ways)</h4>
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
          <h4 className="text-lg font-medium text-white mb-3">Slab Details</h4>
          <div className="overflow-x-auto border border-gray-700 rounded-lg">
            <table className="w-full table-fixed bg-gray-700 rounded-lg">
              <thead>
                <tr className="border-b border-gray-600">
                  <th className="py-2 px-4 text-left text-gray-300">Step</th>
                  <th className="py-2 px-4 text-left text-gray-300">Location</th>
                  <th className="py-2 px-4 text-left text-gray-300">Slabs Needed</th>
                  <th className="py-2 px-4 text-left text-gray-300">Dimensions</th>
                </tr>
              </thead>
              <tbody>
                {slabCalculationResult.stepResults.map((result, index) => (
                  <React.Fragment key={`step-${result.step}`}>
                    <tr className="border-b border-gray-600">
                      <td className="py-2 px-4 text-left text-gray-300">{result.step}</td>
                      <td className="py-2 px-4 text-left text-gray-300">Step</td>
                      <td className="py-2 px-4 text-left text-gray-300">{result.stepSlabsNeeded}</td>
                      <td className="py-2 px-4 text-left text-gray-300">{result.stepSlabDimensions}</td>
                    </tr>
                    <tr className="border-b border-gray-600">
                      <td className="py-2 px-4 text-left text-gray-300">{result.step}</td>
                      <td className="py-2 px-4 text-left text-gray-300">Front</td>
                      <td className="py-2 px-4 text-left text-gray-300">{result.frontSlabsNeeded}</td>
                      <td className="py-2 px-4 text-left text-gray-300">{result.frontSlabDimensions}</td>
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-700 p-4 rounded">
              <h5 className="font-medium mb-2">Total Step Slabs Needed</h5>
              <p className="text-xl">{slabCalculationResult.totalStepSlabs}</p>
            </div>
            <div className="bg-gray-700 p-4 rounded">
              <h5 className="font-medium mb-2">Total Front Slabs Needed</h5>
              <p className="text-xl">{slabCalculationResult.totalFrontSlabs}</p>
            </div>
          </div>
          
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-700 p-4 rounded">
              <h5 className="font-medium mb-2">Total Slabs Needed</h5>
              <p className="text-xl">{slabCalculationResult.totalSlabs}</p>
            </div>
            <div className="bg-gray-700 p-4 rounded">
              <h5 className="font-medium mb-2">Total Cuts Required</h5>
              <p className="text-xl">{slabCalculationResult.totalCuts}</p>
            </div>
          </div>
          
          {wasteMaterials.length > 0 && (
            <div className="mt-6">
              <h4 className="text-lg font-medium text-white mb-3">Waste Material Available for Reuse</h4>
              <div className="overflow-x-auto border border-gray-700 rounded-lg">
                <table className="w-full table-fixed bg-gray-700 rounded-lg">
                  <thead>
                    <tr className="border-b border-gray-600">
                      <th className="py-2 px-4 text-left text-gray-300">Source</th>
                      <th className="py-2 px-4 text-left text-gray-300">Dimensions</th>
                      <th className="py-2 px-4 text-left text-gray-300">Can Be Rotated</th>
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
                          {waste.canBeRotated ? "Yes" : "No"}
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
