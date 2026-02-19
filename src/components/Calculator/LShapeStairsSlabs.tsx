import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface SlabDimension {
  size: string;
  width: number;
  length: number;
}

interface SlabGapOption {
  value: number;
  label: string;
}

interface SlabCuttingOption {
  type: string;
  description: string;
}

interface StepDimension {
  height: number;
  tread: number;
  isFirst: boolean;
  remainingTread: number;
  buriedDepth?: number;
  armA_length: number;
  armB_length: number;
  armA_innerLength: number;
  armB_innerLength: number;
  isPlatform: boolean;
}

interface LShapeStairResult {
  totalSteps: number;
  totalArmALength: number;
  totalArmBLength: number;
  materials: any[];
  stepDimensions: StepDimension[];
  sideOverhang: number;
}

interface WasteMaterial {
  width: number;
  length: number;
  source: string;
  canBeRotated?: boolean;
}

interface CutCalculation {
  dimension: number;
  count: number;
}

interface LShapeStairsSlabsProps {
  stairResult: LShapeStairResult | null;
  slabType?: string;
  taskBreakdown?: any[];
  slabThicknessTop?: number;
  slabThicknessFront?: number;
  overhangFront?: number;
  stepTread?: number;
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

// ─── Component ────────────────────────────────────────────────────────────────

const LShapeStairsSlabs: React.FC<LShapeStairsSlabsProps> = ({
  stairResult,
  slabType = 'porcelain',
  taskBreakdown = [],
  slabThicknessTop = 0,
  slabThicknessFront = 0,
  overhangFront = 0,
  stepTread = 30,
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

  // ─── Slab Options ───────────────────────────────────────────────────────

  const slabDimensions: SlabDimension[] = [
    { size: '90x60', width: 90, length: 60 },
    { size: '60x60', width: 60, length: 60 },
    { size: '60x30', width: 60, length: 30 },
    { size: '30x30', width: 30, length: 30 },
  ];

  const slabPlacementOptions = [
    { id: 'longWay', label: 'Slabs long way' },
    { id: 'sideWays', label: 'Slabs side ways' },
  ];

  const cuttingOptions: SlabCuttingOption[] = [
    { type: 'oneCut', description: '1 cut' },
    { type: 'twoCuts', description: '2 cuts (same on both sides)' },
  ];

  const cornerJointOptions = [
    { id: 'buttJoint', label: 'Butt joint (one arm overlaps)' },
    { id: 'mitre45', label: '45° mitre cut' },
  ];

  const armDominanceOptions = [
    { id: 'armA', label: 'Arm A dominates (covers corner)' },
    { id: 'armB', label: 'Arm B dominates (covers corner)' },
  ];

  // ─── State ──────────────────────────────────────────────────────────────

  const [selectedSlabDimension, setSelectedSlabDimension] = useState<string>(slabDimensions[0].size);
  const [selectedPlacement, setSelectedPlacement] = useState<string>('longWay');
  const [selectedCutting, setSelectedCutting] = useState<string>('oneCut');
  const [adhesiveThickness, setAdhesiveThickness] = useState<string>('0.5');

  // L-shape specific options
  const [cornerJoint, setCornerJoint] = useState<string>('buttJoint');
  const [topDominantArm, setTopDominantArm] = useState<string>('armA');
  const [frontDominantArm, setFrontDominantArm] = useState<string>('armA');

  // Results
  const [slabCalculationResult, setSlabCalculationResult] = useState<any>(null);
  const [wasteMaterials, setWasteMaterials] = useState<WasteMaterial[]>([]);
  const [adhesiveMaterials, setAdhesiveMaterials] = useState<any[]>([]);

  // ─── Helpers ────────────────────────────────────────────────────────────

  const needsCut = (actualDimension: number, requiredDimension: number): boolean => {
    return Math.abs(actualDimension - requiredDimension) > 0.1;
  };

  // ─── Recalculate when inputs change ─────────────────────────────────────

  useEffect(() => {
    if (stairResult) {
      calculateSlabs();
    }
  }, [stairResult, selectedSlabDimension, selectedPlacement, gapBetweenSlabs, selectedCutting, adhesiveThickness, cornerJoint, topDominantArm, frontDominantArm, stepConfig]);

  // ─── MAIN SLAB CALCULATION ──────────────────────────────────────────────

  const calculateSlabs = () => {
    if (!stairResult || !selectedSlabDimension) return;

    const selectedSlab = slabDimensions.find(slab => slab.size === selectedSlabDimension);
    if (!selectedSlab) return;

    const gapCm = (gapBetweenSlabs ?? 2) / 10; // Convert mm to cm (fuga)

    let totalTopSlabs = 0;
    let totalFrontSlabs = 0;
    let totalCuts = 0;
    let totalTopSurfaceArea = 0;
    let totalFrontSurfaceArea = 0;

    const stepResults: any[] = [];
    const wasteList: WasteMaterial[] = [];

    // Track cuts for callback
    const lengthCutsMap = new Map<number, number>();
    const widthCutsMap = new Map<number, number>();

    // Track slab dimensions for installation task matching
    const slabDimensionsMap = new Map<string, number>();

    // ── Helper functions ──────────────────────────────────────────────────

    const trackCut = (dimension: number, type: 'length' | 'width', count: number = 1) => {
      const map = type === 'length' ? lengthCutsMap : widthCutsMap;
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

    const trackSurfaceArea = (width: number, length: number, type: 'top' | 'front', count: number = 1) => {
      const surfaceArea = (width * length / 10000) * count;
      if (type === 'top') {
        totalTopSurfaceArea += surfaceArea;
      } else {
        totalFrontSurfaceArea += surfaceArea;
      }
    };

    const trackSlabDimension = (width: number, length: number, count: number = 1) => {
      const key = `${Math.round(width)}x${Math.round(length)}`;
      slabDimensionsMap.set(key, (slabDimensionsMap.get(key) || 0) + count);
    };

    /**
     * Try to use waste from the same step & arm's Top for covering the entire front.
     * Modeled on StandardStairsSlabs: if waste exists, entire front is from waste (newSlabsNeeded=0).
     * Dimensions are calculated from frontWidth/frontHeight, NOT from waste piece dimensions.
     * ALL matching waste pieces are removed from pool regardless of their individual sizes.
     * No remainders are generated from front consumption.
     */
    const tryUseFrontFromWaste = (
      frontWidth: number,
      frontHeight: number,
      stepLabel: string,
      armLabel: string,
      surfaceType: 'front'
    ): {
      reused: true;
      slabsNeeded: number;
      newSlabsNeeded: 0;
      dimensions: string;
      dimensionsParts: { text: string; fromWaste: boolean }[];
      cuts: number;
      wasteUsed: true;
      wasteSource: string;
    } | null => {
      if (frontWidth <= 0 || frontHeight <= 0) return null;

      const armTopWaste = wasteList.filter(w => {
        const matchesSource =
          w.source.includes(stepLabel + ' ') &&
          w.source.includes(armLabel) &&
          w.source.includes('Top');
        const fitsHeight = w.width >= frontHeight || w.length >= frontHeight;
        const bothUseful = w.width > 1 && w.length > 1;
        return matchesSource && fitsHeight && bothUseful;
      });

      if (armTopWaste.length === 0) return null;

      const wasteSource = armTopWaste[0].source;

      const slabsNeededWithoutGaps = Math.ceil((frontWidth + gapCm) / (slabWidth + gapCm));
      const totalGaps = slabsNeededWithoutGaps > 0 ? (slabsNeededWithoutGaps - 1) * gapCm : 0;

      let cuts = 0;
      const dimParts: string[] = [];

      if (selectedCutting === 'oneCut') {
        const fullSlabsCount = Math.max(0, slabsNeededWithoutGaps - 1);
        const widthCoveredByFullSlabs = fullSlabsCount * slabWidth;
        const remainingWidth = frontWidth - widthCoveredByFullSlabs - totalGaps;

        if (remainingWidth <= 0.1) {
          for (let p = 0; p < slabsNeededWithoutGaps; p++) {
            dimParts.push(`1x(${slabWidth}x${frontHeight.toFixed(1)}cm)`);
            trackSlabDimension(slabWidth, frontHeight, 1);
            trackSurfaceArea(slabWidth, frontHeight, surfaceType, 1);
            if (needsCut(slabLength, frontHeight)) { cuts += 1; trackCut(frontHeight, 'length', 1); }
          }
        } else {
          for (let p = 0; p < fullSlabsCount; p++) {
            dimParts.push(`1x(${slabWidth}x${frontHeight.toFixed(1)}cm)`);
            trackSlabDimension(slabWidth, frontHeight, 1);
            trackSurfaceArea(slabWidth, frontHeight, surfaceType, 1);
            if (needsCut(slabLength, frontHeight)) { cuts += 1; trackCut(frontHeight, 'length', 1); }
          }
          dimParts.push(`1x(${remainingWidth.toFixed(1)}x${frontHeight.toFixed(1)}cm)`);
          trackSlabDimension(remainingWidth, frontHeight, 1);
          trackSurfaceArea(remainingWidth, frontHeight, surfaceType, 1);
          cuts += 1; trackCut(remainingWidth, 'width', 1);
          if (needsCut(slabLength, frontHeight)) { cuts += 1; trackCut(frontHeight, 'length', 1); }
        }
      } else {
        if (slabsNeededWithoutGaps > 1) {
          const fullSlabsCount = Math.max(0, slabsNeededWithoutGaps - 2);
          const widthCoveredByFullSlabs = fullSlabsCount * slabWidth;
          const remainingWidth = frontWidth - widthCoveredByFullSlabs - totalGaps;
          const equalPieceWidth = remainingWidth / 2;

          if (remainingWidth <= 0.1 || equalPieceWidth <= 0.1) {
            const count = Math.max(1, slabsNeededWithoutGaps - 1);
            for (let p = 0; p < count; p++) {
              dimParts.push(`1x(${slabWidth}x${frontHeight.toFixed(1)}cm)`);
              trackSlabDimension(slabWidth, frontHeight, 1);
              trackSurfaceArea(slabWidth, frontHeight, surfaceType, 1);
              if (needsCut(slabLength, frontHeight)) { cuts += 1; trackCut(frontHeight, 'length', 1); }
            }
          } else {
            for (let p = 0; p < fullSlabsCount; p++) {
              dimParts.push(`1x(${slabWidth}x${frontHeight.toFixed(1)}cm)`);
              trackSlabDimension(slabWidth, frontHeight, 1);
              trackSurfaceArea(slabWidth, frontHeight, surfaceType, 1);
              if (needsCut(slabLength, frontHeight)) { cuts += 1; trackCut(frontHeight, 'length', 1); }
            }
            for (let p = 0; p < 2; p++) {
              dimParts.push(`1x(${equalPieceWidth.toFixed(1)}x${frontHeight.toFixed(1)}cm)`);
              trackSlabDimension(equalPieceWidth, frontHeight, 1);
              trackSurfaceArea(equalPieceWidth, frontHeight, surfaceType, 1);
              cuts += 1; trackCut(equalPieceWidth, 'width', 1);
              if (needsCut(slabLength, frontHeight)) { cuts += 1; trackCut(frontHeight, 'length', 1); }
            }
          }
        } else {
          dimParts.push(`1x(${frontWidth.toFixed(1)}x${frontHeight.toFixed(1)}cm)`);
          trackSlabDimension(frontWidth, frontHeight, 1);
          trackSurfaceArea(frontWidth, frontHeight, surfaceType, 1);
          cuts += 1; trackCut(frontWidth, 'width', 1);
          if (needsCut(slabLength, frontHeight)) { cuts += 1; trackCut(frontHeight, 'length', 1); }
        }
      }

      const dimensionsParts: { text: string; fromWaste: boolean }[] = dimParts.map((p, i) => ({
        text: i === dimParts.length - 1 ? `${p} [Using waste from ${wasteSource}]` : p,
        fromWaste: true
      }));
      const dimensions = dimensionsParts.map(p => p.text).join(' + ');

      for (let idx = wasteList.length - 1; idx >= 0; idx--) {
        const w = wasteList[idx];
        if (
          w.source.includes(stepLabel + ' ') &&
          w.source.includes(armLabel) &&
          w.source.includes('Top')
        ) {
          wasteList.splice(idx, 1);
        }
      }

      totalCuts += cuts;

      return {
        reused: true,
        slabsNeeded: dimParts.length,
        newSlabsNeeded: 0,
        dimensions,
        dimensionsParts,
        cuts,
        wasteUsed: true,
        wasteSource
      };
    };

    /**
     * Try to reuse a waste piece for a surface. Returns result if reused, null otherwise.
     */
    const tryReuseWaste = (
      surfaceWidth: number,
      surfaceDepth: number,
      surfaceType: 'top' | 'front',
      stepLabel: string,
      armLabel: string,
      subtractCornerGapFromLastSlab = false,
      excludeArmSources?: string[]
    ): {
      reused: true;
      slabsNeeded: number;
      newSlabsNeeded: number;
      dimensions: string;
      dimensionsParts: { text: string; fromWaste: boolean }[];
      cuts: number;
      wasteUsed: boolean;
      wasteSource: string;
    } | null => {
      if (surfaceWidth <= 0 || surfaceDepth <= 0) return null;

      const usableWastePieces = wasteList.filter(waste => {
        if (excludeArmSources && excludeArmSources.some(ex => waste.source.includes(ex))) return false;
        const fitsNormal = waste.width >= surfaceDepth && waste.length >= surfaceWidth;
        const fitsRotated = waste.length >= surfaceDepth && waste.width >= surfaceWidth;
        const bothUseful = waste.width > 1 && waste.length > 1;
        return (fitsNormal || fitsRotated) && bothUseful;
      });

      if (usableWastePieces.length === 0) return null;

      usableWastePieces.sort((a, b) => {
        const aArea = a.width * a.length;
        const bArea = b.width * b.length;
        return aArea - bArea;
      });

      const selectedWaste = usableWastePieces[0];
      const canCoverFullWidth = selectedWaste.length >= surfaceWidth || selectedWaste.width >= surfaceWidth;

      if (canCoverFullWidth) {
        const wasteSource = selectedWaste.source;

        const fitsNormal = selectedWaste.width >= surfaceDepth && selectedWaste.length >= surfaceWidth;
        const fitsRotated = selectedWaste.length >= surfaceDepth && selectedWaste.width >= surfaceWidth;
        const useRotated = !fitsNormal && fitsRotated;

        let cuts = 0;
        if (needsCut(useRotated ? selectedWaste.length : selectedWaste.width, surfaceDepth)) {
          cuts += 1;
          trackCut(surfaceDepth, 'length', 1);
        }
        if (needsCut(useRotated ? selectedWaste.width : selectedWaste.length, surfaceWidth)) {
          cuts += 1;
          trackCut(surfaceWidth, 'width', 1);
        }

        const slabW = subtractCornerGapFromLastSlab ? Math.max(0, surfaceWidth - gapCm) : surfaceWidth;
        const dimensions = useRotated
          ? `1x(${slabW.toFixed(1)}x${surfaceDepth.toFixed(1)}cm) [Using rotated waste from ${wasteSource}]`
          : `1x(${slabW.toFixed(1)}x${surfaceDepth.toFixed(1)}cm) [Using waste from ${wasteSource}]`;

        trackSlabDimension(slabW, surfaceDepth, 1);
        trackSurfaceArea(slabW, surfaceDepth, surfaceType, 1);

        const wasteIndex = wasteList.indexOf(selectedWaste);
        if (wasteIndex > -1) wasteList.splice(wasteIndex, 1);

        if (useRotated) {
          const depthRemainder = selectedWaste.length - surfaceDepth;
          const widthRemainder = selectedWaste.width - surfaceWidth;
          if (depthRemainder > 1 && depthRemainder * selectedWaste.width >= widthRemainder * selectedWaste.length) {
            wasteList.push({
              width: selectedWaste.width,
              length: depthRemainder,
              source: `Remaining from ${wasteSource}`,
              canBeRotated: true
            });
          } else if (widthRemainder > 1) {
            wasteList.push({
              width: widthRemainder,
              length: selectedWaste.length,
              source: `Remaining from ${wasteSource}`,
              canBeRotated: true
            });
          } else if (depthRemainder > 1) {
            wasteList.push({
              width: selectedWaste.width,
              length: depthRemainder,
              source: `Remaining from ${wasteSource}`,
              canBeRotated: true
            });
          }
        } else {
          const depthRemainder = selectedWaste.width - surfaceDepth;
          const widthRemainder = selectedWaste.length - surfaceWidth;
          if (depthRemainder > 1 && depthRemainder * selectedWaste.length >= widthRemainder * selectedWaste.width) {
            wasteList.push({
              width: depthRemainder,
              length: selectedWaste.length,
              source: `Remaining from ${wasteSource}`,
              canBeRotated: true
            });
          } else if (widthRemainder > 1) {
            wasteList.push({
              width: selectedWaste.width,
              length: widthRemainder,
              source: `Remaining from ${wasteSource}`,
              canBeRotated: true
            });
          } else if (depthRemainder > 1) {
            wasteList.push({
              width: depthRemainder,
              length: selectedWaste.length,
              source: `Remaining from ${wasteSource}`,
              canBeRotated: true
            });
          }
        }

        return {
          reused: true,
          slabsNeeded: 1,
          newSlabsNeeded: 0,
          dimensions,
          cuts,
          wasteUsed: true,
          wasteSource
        };
      }

      // Partial width: check for second waste piece
      const coveredWidth = Math.max(selectedWaste.width, selectedWaste.length);
      const remainingWidth = surfaceWidth - coveredWidth;

      const remainingWastePieces = wasteList.filter(waste => {
        if (waste === selectedWaste) return false;
        const fitsRemaining = (waste.width >= surfaceDepth && waste.length >= remainingWidth) ||
                            (waste.length >= surfaceDepth && waste.width >= remainingWidth);
        return fitsRemaining;
      });

      if (remainingWastePieces.length > 0) {
        const secondWaste = remainingWastePieces[0];
        const wasteSource = `${selectedWaste.source} and ${secondWaste.source}`;

        trackSlabDimension(surfaceWidth, surfaceDepth, 2);
        trackSurfaceArea(surfaceWidth, surfaceDepth, surfaceType, 2);

        const wasteIndex1 = wasteList.indexOf(selectedWaste);
        const wasteIndex2 = wasteList.indexOf(secondWaste);
        if (wasteIndex1 > -1) wasteList.splice(wasteIndex1, 1);
        if (wasteIndex2 > -1) wasteList.splice(wasteIndex2, 1);

        const dimensions = `2x(${surfaceWidth.toFixed(1)}x${surfaceDepth.toFixed(1)}cm) [Using waste from ${wasteSource}]`;

        return {
          reused: true,
          slabsNeeded: 2,
          newSlabsNeeded: 0,
          dimensions,
          dimensionsParts: [{ text: dimensions, fromWaste: true }],
          cuts: 0,
          wasteUsed: true,
          wasteSource
        };
      }

      return null;
    };

    // Determine slab orientation based on placement
    let slabWidth: number, slabLength: number;
    if (selectedPlacement === 'longWay') {
      slabWidth = Math.max(selectedSlab.width, selectedSlab.length);
      slabLength = Math.min(selectedSlab.width, selectedSlab.length);
    } else {
      slabWidth = Math.min(selectedSlab.width, selectedSlab.length);
      slabLength = Math.max(selectedSlab.width, selectedSlab.length);
    }

    /**
     * Calculate slabs needed for a rectangular surface.
     * Returns: { slabsNeeded, newSlabsNeeded, dimensions, cuts }
     *
     * @param surfaceWidth - the width to cover with slabs (the dimension along which we tile)
     * @param surfaceDepth - the depth/height of the surface (tread for top, step height for front)
     * @param surfaceType - 'top' or 'front' for tracking
     * @param stepLabel - label for waste tracking
     * @param armLabel - 'A' or 'B' for display
     */
    const calculateSlabsForSurface = (
      surfaceWidth: number,
      surfaceDepth: number,
      surfaceType: 'top' | 'front',
      stepLabel: string,
      armLabel: string,
      subtractCornerGapFromLastSlab = false
    ): {
      slabsNeeded: number;
      newSlabsNeeded: number;
      dimensions: string;
      dimensionsParts: { text: string; fromWaste: boolean }[];
      cuts: number;
      wasteUsed: boolean;
      wasteSource: string;
    } => {
      if (surfaceWidth <= 0 || surfaceDepth <= 0) {
        return { slabsNeeded: 0, newSlabsNeeded: 0, dimensions: '-', dimensionsParts: [{ text: '-', fromWaste: false }], cuts: 0, wasteUsed: false, wasteSource: '' };
      }

      let slabsNeeded = 0;
      let newSlabsNeeded = 0;
      let dimensions = '';
      let dimensionsParts: { text: string; fromWaste: boolean }[] = [];
      let cuts = 0;

      // Calculate how many slabs fit along the width (gap-aware)
      const slabsNeededWithoutGaps = Math.ceil((surfaceWidth + gapCm) / (slabWidth + gapCm));
      const totalGaps = (slabsNeededWithoutGaps - 1) * gapCm;

      const findBestWaste = (width: number, depth: number) => {
        const candidates = wasteList
          .filter(w => {
            const fitsNormal = w.width >= depth && w.length >= width;
            const fitsRotated = w.length >= depth && w.width >= width;
            return (fitsNormal || fitsRotated) && w.width > 1 && w.length > 1;
          })
          .sort((a, b) => a.width * a.length - b.width * b.length);
        return candidates[0] || null;
      };

      const consumeWaste = (
        w: { width: number; length: number; source: string },
        usedWidth: number,
        usedDepth: number
      ) => {
        const idx = wasteList.indexOf(w);
        if (idx > -1) wasteList.splice(idx, 1);

        const fitsNormal = w.width >= usedDepth && w.length >= usedWidth;
        const fitsRotated = w.length >= usedDepth && w.width >= usedWidth;

        if (fitsNormal) {
          const depthRemainder = w.width - usedDepth;
          const widthRemainder = w.length - usedWidth;

          if (depthRemainder > 1 && depthRemainder * w.length >= widthRemainder * w.width) {
            wasteList.push({
              width: depthRemainder,
              length: w.length,
              source: `Remaining from ${w.source}`,
              canBeRotated: true
            });
          } else if (widthRemainder > 1) {
            wasteList.push({
              width: w.width,
              length: widthRemainder,
              source: `Remaining from ${w.source}`,
              canBeRotated: true
            });
          } else if (depthRemainder > 1) {
            wasteList.push({
              width: depthRemainder,
              length: w.length,
              source: `Remaining from ${w.source}`,
              canBeRotated: true
            });
          }
        } else if (fitsRotated) {
          const depthRemainder = w.length - usedDepth;
          const widthRemainder = w.width - usedWidth;

          if (depthRemainder > 1 && depthRemainder * w.width >= widthRemainder * w.length) {
            wasteList.push({
              width: w.width,
              length: depthRemainder,
              source: `Remaining from ${w.source}`,
              canBeRotated: true
            });
          } else if (widthRemainder > 1) {
            wasteList.push({
              width: widthRemainder,
              length: w.length,
              source: `Remaining from ${w.source}`,
              canBeRotated: true
            });
          } else if (depthRemainder > 1) {
            wasteList.push({
              width: w.width,
              length: depthRemainder,
              source: `Remaining from ${w.source}`,
              canBeRotated: true
            });
          }
        }
      };

      // Check if we need to cut the last slab
      if (surfaceWidth < (slabsNeededWithoutGaps * slabWidth) + totalGaps) {
        // Needs cutting
        if (selectedCutting === 'oneCut') {
          const fullSlabsCount = slabsNeededWithoutGaps - 1;
          const widthCoveredByFullSlabs = fullSlabsCount * slabWidth;
          const remainingWidth = surfaceWidth - widthCoveredByFullSlabs - totalGaps;

            if (remainingWidth <= 0.1) {
              slabsNeeded = slabsNeededWithoutGaps;
              if (needsCut(slabLength, surfaceDepth)) {
                cuts += slabsNeeded;
                trackCut(surfaceDepth, 'length', slabsNeeded);
              }
            const lastSlabW = subtractCornerGapFromLastSlab ? slabWidth - gapCm : slabWidth;
            if (subtractCornerGapFromLastSlab && slabsNeeded > 1) {
              dimensions = `${slabsNeeded - 1}x(${slabWidth}x${surfaceDepth.toFixed(1)}cm) + 1x(${lastSlabW.toFixed(1)}x${surfaceDepth.toFixed(1)}cm)`;
              dimensionsParts = [{ text: dimensions, fromWaste: false }];
              trackSurfaceArea(slabWidth, surfaceDepth, surfaceType, slabsNeeded - 1);
              trackSurfaceArea(lastSlabW, surfaceDepth, surfaceType, 1);
              trackSlabDimension(slabWidth, surfaceDepth, slabsNeeded - 1);
              trackSlabDimension(lastSlabW, surfaceDepth, 1);
            } else {
              dimensions = `${slabsNeeded}x(${lastSlabW}x${surfaceDepth.toFixed(1)}cm)`;
              dimensionsParts = [{ text: dimensions, fromWaste: false }];
              trackSurfaceArea(lastSlabW, surfaceDepth, surfaceType, slabsNeeded);
              trackSlabDimension(lastSlabW, surfaceDepth, slabsNeeded);
            }
          } else {
            slabsNeeded = fullSlabsCount + 1;
            const lastSlabWidth = subtractCornerGapFromLastSlab ? Math.max(0, remainingWidth - gapCm) : remainingWidth;
            let newSlabsCount = 0;
            const dimParts: { w: number; d: number; fromWaste: boolean; wasteSource?: string }[] = [];

            for (let p = 0; p < fullSlabsCount; p++) {
              const pieceWaste = findBestWaste(slabWidth, surfaceDepth);
              if (pieceWaste) {
                consumeWaste(pieceWaste, slabWidth, surfaceDepth);
                cuts += 1;
                trackCut(surfaceDepth, 'length', 1);
                dimParts.push({ w: slabWidth, d: surfaceDepth, fromWaste: true, wasteSource: pieceWaste.source });
              } else {
                newSlabsCount++;
                if (needsCut(slabLength, surfaceDepth)) {
                  cuts += 1;
                  trackCut(surfaceDepth, 'length', 1);
                  wasteList.push({
                    width: slabWidth,
                    length: slabLength - surfaceDepth,
                    source: `${stepLabel} ${armLabel} ${surfaceType}`,
                    canBeRotated: true
                  });
                }
                dimParts.push({ w: slabWidth, d: surfaceDepth, fromWaste: false });
              }
            }

            const cutPieceWaste = findBestWaste(remainingWidth, surfaceDepth);
            if (cutPieceWaste) {
              consumeWaste(cutPieceWaste, remainingWidth, surfaceDepth);
              cuts += 1;
              trackCut(remainingWidth, 'width', 1);
              if (needsCut(slabLength, surfaceDepth)) {
                cuts += 1;
                trackCut(surfaceDepth, 'length', 1);
              }
              dimParts.push({ w: lastSlabWidth, d: surfaceDepth, fromWaste: true, wasteSource: cutPieceWaste.source });
            } else {
              newSlabsCount++;
              cuts += 1;
              trackCut(remainingWidth, 'width', 1);
              if (remainingWidth > 0.1 && remainingWidth < slabWidth) {
                wasteList.push({
                  width: slabWidth - remainingWidth,
                  length: slabLength,
                  source: `${stepLabel} ${armLabel} ${surfaceType}`,
                  canBeRotated: true
                });
              }
              if (needsCut(slabLength, surfaceDepth)) {
                cuts += 1;
                trackCut(surfaceDepth, 'length', 1);
                wasteList.push({
                  width: remainingWidth,
                  length: slabLength - surfaceDepth,
                  source: `${stepLabel} ${armLabel} ${surfaceType}`,
                  canBeRotated: true
                });
              }
              dimParts.push({ w: lastSlabWidth, d: surfaceDepth, fromWaste: false });
            }

            const dimStrings: string[] = [];
            let i = 0;
            while (i < dimParts.length) {
              const part = dimParts[i];
              if (part.fromWaste) {
                const text = `1x(${part.w.toFixed(1)}x${part.d.toFixed(1)}cm) [Using waste from ${part.wasteSource}]`;
                dimStrings.push(text);
                dimensionsParts.push({ text, fromWaste: true });
                trackSurfaceArea(part.w, part.d, surfaceType, 1);
                trackSlabDimension(part.w, part.d, 1);
                i++;
              } else {
                let sameCount = 0;
                while (i + sameCount < dimParts.length && !dimParts[i + sameCount].fromWaste && dimParts[i + sameCount].w === part.w && dimParts[i + sameCount].d === part.d) {
                  sameCount++;
                }
                const text = `${sameCount}x(${part.w.toFixed(1)}x${part.d.toFixed(1)}cm)`;
                dimStrings.push(text);
                dimensionsParts.push({ text, fromWaste: false });
                trackSurfaceArea(part.w, part.d, surfaceType, sameCount);
                trackSlabDimension(part.w, part.d, sameCount);
                i += sameCount;
              }
            }
            dimensions = dimStrings.join(' + ');
            newSlabsNeeded = newSlabsCount;
          }
        } else {
          // 2 cuts option
          if (slabsNeededWithoutGaps > 1) {
            const fullSlabsCount = slabsNeededWithoutGaps - 2;
            const widthCoveredByFullSlabs = fullSlabsCount * slabWidth;
            const remainingWidth = surfaceWidth - widthCoveredByFullSlabs - totalGaps;
            const equalPieceWidth = remainingWidth / 2;

              if (remainingWidth <= 0.1 || equalPieceWidth <= 0.1) {
                slabsNeeded = Math.max(1, slabsNeededWithoutGaps - 1);
                if (needsCut(slabLength, surfaceDepth)) {
                  cuts += slabsNeeded;
                  trackCut(surfaceDepth, 'length', slabsNeeded);
                }
              const lastSlabW = subtractCornerGapFromLastSlab ? slabWidth - gapCm : slabWidth;
              if (subtractCornerGapFromLastSlab && slabsNeeded > 1) {
                dimensions = `${slabsNeeded - 1}x(${slabWidth}x${surfaceDepth.toFixed(1)}cm) + 1x(${lastSlabW.toFixed(1)}x${surfaceDepth.toFixed(1)}cm)`;
                dimensionsParts = [{ text: dimensions, fromWaste: false }];
                trackSurfaceArea(slabWidth, surfaceDepth, surfaceType, slabsNeeded - 1);
                trackSurfaceArea(lastSlabW, surfaceDepth, surfaceType, 1);
                trackSlabDimension(slabWidth, surfaceDepth, slabsNeeded - 1);
                trackSlabDimension(lastSlabW, surfaceDepth, 1);
              } else {
                dimensions = `${slabsNeeded}x(${lastSlabW}x${surfaceDepth.toFixed(1)}cm)`;
                dimensionsParts = [{ text: dimensions, fromWaste: false }];
                trackSurfaceArea(lastSlabW, surfaceDepth, surfaceType, slabsNeeded);
                trackSlabDimension(lastSlabW, surfaceDepth, slabsNeeded);
              }
            } else {
            slabsNeeded = fullSlabsCount + 2;
            const lastPieceW = subtractCornerGapFromLastSlab ? Math.max(0, equalPieceWidth - gapCm) : equalPieceWidth;
            let newSlabsCountTwo = 0;
            const dimPartsTwo: { w: number; d: number; fromWaste: boolean; wasteSource?: string }[] = [];

            for (let p = 0; p < fullSlabsCount; p++) {
              const pieceWaste = findBestWaste(slabWidth, surfaceDepth);
              if (pieceWaste) {
                consumeWaste(pieceWaste, slabWidth, surfaceDepth);
                cuts += 1;
                trackCut(surfaceDepth, 'length', 1);
                dimPartsTwo.push({ w: slabWidth, d: surfaceDepth, fromWaste: true, wasteSource: pieceWaste.source });
              } else {
                newSlabsCountTwo++;
                if (needsCut(slabLength, surfaceDepth)) {
                  cuts += 1;
                  trackCut(surfaceDepth, 'length', 1);
                  wasteList.push({
                    width: slabWidth,
                    length: slabLength - surfaceDepth,
                    source: `${stepLabel} ${armLabel} ${surfaceType}`,
                    canBeRotated: true
                  });
                }
                dimPartsTwo.push({ w: slabWidth, d: surfaceDepth, fromWaste: false });
              }
            }

            for (let p = 0; p < 2; p++) {
              const displayW = p === 1 && subtractCornerGapFromLastSlab ? lastPieceW : equalPieceWidth;
              const pieceWaste = findBestWaste(equalPieceWidth, surfaceDepth);
              if (pieceWaste) {
                consumeWaste(pieceWaste, equalPieceWidth, surfaceDepth);
                cuts += 1;
                trackCut(equalPieceWidth, 'width', 1);
                if (needsCut(slabLength, surfaceDepth)) {
                  cuts += 1;
                  trackCut(surfaceDepth, 'length', 1);
                }
                dimPartsTwo.push({ w: displayW, d: surfaceDepth, fromWaste: true, wasteSource: pieceWaste.source });
              } else {
                newSlabsCountTwo++;
                cuts += 1;
                trackCut(equalPieceWidth, 'width', 1);
                if (equalPieceWidth > 0.1 && equalPieceWidth < slabWidth) {
                  wasteList.push({
                    width: slabWidth - equalPieceWidth,
                    length: slabLength,
                    source: `${stepLabel} ${armLabel} ${surfaceType}`,
                    canBeRotated: true
                  });
                }
                if (needsCut(slabLength, surfaceDepth)) {
                  cuts += 1;
                  trackCut(surfaceDepth, 'length', 1);
                  wasteList.push({
                    width: equalPieceWidth,
                    length: slabLength - surfaceDepth,
                    source: `${stepLabel} ${armLabel} ${surfaceType}`,
                    canBeRotated: true
                  });
                }
                dimPartsTwo.push({ w: displayW, d: surfaceDepth, fromWaste: false });
              }
            }

            const dimStringsTwo: string[] = [];
            let i = 0;
            while (i < dimPartsTwo.length) {
              const part = dimPartsTwo[i];
              if (part.fromWaste) {
                const text = `1x(${part.w.toFixed(1)}x${part.d.toFixed(1)}cm) [Using waste from ${part.wasteSource}]`;
                dimStringsTwo.push(text);
                dimensionsParts.push({ text, fromWaste: true });
                trackSurfaceArea(part.w, part.d, surfaceType, 1);
                trackSlabDimension(part.w, part.d, 1);
                i++;
              } else {
                let sameCount = 0;
                while (i + sameCount < dimPartsTwo.length && !dimPartsTwo[i + sameCount].fromWaste && dimPartsTwo[i + sameCount].w === part.w && dimPartsTwo[i + sameCount].d === part.d) {
                  sameCount++;
                }
                const text = `${sameCount}x(${part.w.toFixed(1)}x${part.d.toFixed(1)}cm)`;
                dimStringsTwo.push(text);
                dimensionsParts.push({ text, fromWaste: false });
                trackSurfaceArea(part.w, part.d, surfaceType, sameCount);
                trackSlabDimension(part.w, part.d, sameCount);
                i += sameCount;
              }
            }
            dimensions = dimStringsTwo.join(' + ');
            newSlabsNeeded = newSlabsCountTwo;
          }

          } else {
            slabsNeeded = 1;
            cuts += 1;
            trackCut(surfaceWidth, 'width', 1);

            if (surfaceWidth > 0.1 && surfaceWidth < slabWidth) {
              wasteList.push({
                width: slabWidth - surfaceWidth,
                length: slabLength,
                source: `${stepLabel} ${armLabel} ${surfaceType}`,
                canBeRotated: true
              });
            }

            if (needsCut(slabLength, surfaceDepth)) {
              cuts += 1;
              trackCut(surfaceDepth, 'length', 1);
              wasteList.push({
                width: surfaceWidth,
                length: slabLength - surfaceDepth,
                source: `${stepLabel} ${armLabel} ${surfaceType}`,
                canBeRotated: true
              });
            }

            const lastSlabW = subtractCornerGapFromLastSlab ? Math.max(0, surfaceWidth - gapCm) : surfaceWidth;
            dimensions = `1x(${lastSlabW.toFixed(1)}x${surfaceDepth.toFixed(1)}cm)`;
            dimensionsParts = [{ text: dimensions, fromWaste: false }];
            trackSurfaceArea(lastSlabW, surfaceDepth, surfaceType, 1);
            trackSlabDimension(lastSlabW, surfaceDepth, 1);
          }
        }
      } else {
        // No cutting needed
        slabsNeeded = slabsNeededWithoutGaps;

        if (needsCut(slabLength, surfaceDepth)) {
          cuts += slabsNeeded;
          trackCut(surfaceDepth, 'length', slabsNeeded);
        }

        const lastSlabW = subtractCornerGapFromLastSlab ? slabWidth - gapCm : slabWidth;
        if (subtractCornerGapFromLastSlab && slabsNeeded > 1) {
          dimensions = `${slabsNeeded - 1}x(${slabWidth}x${surfaceDepth.toFixed(1)}cm) + 1x(${lastSlabW.toFixed(1)}x${surfaceDepth.toFixed(1)}cm)`;
          dimensionsParts = [{ text: dimensions, fromWaste: false }];
          trackSurfaceArea(slabWidth, surfaceDepth, surfaceType, slabsNeeded - 1);
          trackSurfaceArea(lastSlabW, surfaceDepth, surfaceType, 1);
          trackSlabDimension(slabWidth, surfaceDepth, slabsNeeded - 1);
          trackSlabDimension(lastSlabW, surfaceDepth, 1);
        } else {
          dimensions = `${slabsNeeded}x(${lastSlabW}x${surfaceDepth.toFixed(1)}cm)`;
          dimensionsParts = [{ text: dimensions, fromWaste: false }];
          trackSurfaceArea(lastSlabW, surfaceDepth, surfaceType, slabsNeeded);
          trackSlabDimension(lastSlabW, surfaceDepth, slabsNeeded);
        }
      }

      totalCuts += cuts;

      return {
        slabsNeeded,
        newSlabsNeeded: newSlabsNeeded || slabsNeeded,
        dimensions,
        dimensionsParts,
        cuts,
        wasteUsed: (newSlabsNeeded || slabsNeeded) < slabsNeeded,
        wasteSource: (newSlabsNeeded || slabsNeeded) < slabsNeeded ? 'various' : ''
      };
    };

    // ── Process each step ─────────────────────────────────────────────────

    for (let i = 0; i < stairResult.totalSteps; i++) {
      const stepDim = stairResult.stepDimensions[i];
      const stepLabel = `Step ${i + 1}`;

      // Top slab depth depends on stepConfig (frontsOnTop vs stepsToFronts)
      const isLastStep = stepDim.isPlatform;
      let topSlabDepth: number;
      if (stepConfig === 'frontsOnTop') {
        topSlabDepth = isLastStep
          ? stepTread - gapCm
          : stepTread + slabThicknessFront - 0.5;
      } else {
        topSlabDepth = stepTread - gapCm;
      }

      // Individual step height (for front slabs)
      const previousStepHeight = i > 0 ? stairResult.stepDimensions[i - 1].height : 0;
      const individualStepHeight = stepDim.height - previousStepHeight;

      // The dimension along the arm for top slabs:
      // Using innerLength which decreases per step
      const armA_slabLength = stepDim.armA_length;
      const armB_slabLength = stepDim.armB_length;

      let topArmA_width: number, topArmA_depth: number, topArmB_width: number, topArmB_depth: number;
      let frontArmA_width: number, frontArmA_height: number, frontArmB_width: number, frontArmB_height: number;

      if (cornerJoint === 'buttJoint') {
        if (topDominantArm === 'armA') {
          // Arm A covers the corner - full length
          topArmA_width = armA_slabLength;
          topArmA_depth = topSlabDepth;

          // Arm B is shorter - subtract topSlabDepth (arm A's depth occupies corner) and fuga
          topArmB_width = armB_slabLength - topSlabDepth - gapCm;
          topArmB_depth = topSlabDepth;
        } else {
          // Arm B covers the corner
          topArmB_width = armB_slabLength;
          topArmB_depth = topSlabDepth;

          // Arm A is shorter
          topArmA_width = armA_slabLength - topSlabDepth - gapCm;
          topArmA_depth = topSlabDepth;
        }
      } else {
        // 45° mitre - both arms extend to the corner point
        topArmA_width = armA_slabLength;
        topArmA_depth = topSlabDepth;
        topArmB_width = armB_slabLength;
        topArmB_depth = topSlabDepth;

        // Add 45° cut for each step (one cut per arm at the corner), excluding platform
        if (!stepDim.isPlatform) {
          totalCuts += 2;
          trackCut(topSlabDepth, 'length', 2);
        }
      }

      const topArmASubtractGap = cornerJoint === 'buttJoint' && topDominantArm === 'armB';
      const topArmBSubtractGap = cornerJoint === 'buttJoint' && topDominantArm === 'armA';

      // Front height: reduce by slabThicknessTop when frontsOnTop and not first step
      const effectiveFrontHeight = (stepConfig === 'frontsOnTop' && i > 0)
        ? Math.max(0, individualStepHeight - (slabThicknessTop ?? 0))
        : individualStepHeight;
      frontArmA_height = effectiveFrontHeight;
      frontArmB_height = effectiveFrontHeight;

      if (frontDominantArm === 'armA') {
        // Front A is full length of arm A (murowany bok)
        frontArmA_width = armA_slabLength - overhangFront;

        // Front B is shorter - subtract slab thickness of front A and fuga
        frontArmB_width = armB_slabLength - overhangFront - slabThicknessFront - gapCm;
      } else {
        // Front B is full length
        frontArmB_width = armB_slabLength - overhangFront;

        // Front A is shorter
        frontArmA_width = armA_slabLength - overhangFront - slabThicknessFront - gapCm;
      }

      // Top A: reuse waste (exclude Arm B) → new slabs
      let topArmAResult = tryReuseWaste(topArmA_width, topArmA_depth, 'top', stepLabel, 'Arm A Top', topArmASubtractGap, ['Arm B']);
      if (!topArmAResult) {
        topArmAResult = calculateSlabsForSurface(
          topArmA_width, topArmA_depth, 'top', stepLabel, 'Arm A Top', topArmASubtractGap
        );
      } else {
        totalCuts += topArmAResult.cuts;
      }

      // Front A: use waste from this step's Arm A Top → new slabs
      let frontArmAResult = tryUseFrontFromWaste(frontArmA_width, frontArmA_height, stepLabel, 'Arm A', 'front');
      if (!frontArmAResult) {
        frontArmAResult = calculateSlabsForSurface(
          frontArmA_width, frontArmA_height, 'front', stepLabel, 'Arm A Front'
        );
      }

      // Top B: reuse waste (exclude Arm A) → new slabs
      let topArmBResult = tryReuseWaste(topArmB_width, topArmB_depth, 'top', stepLabel, 'Arm B Top', topArmBSubtractGap, ['Arm A']);
      if (!topArmBResult) {
        topArmBResult = calculateSlabsForSurface(
          topArmB_width, topArmB_depth, 'top', stepLabel, 'Arm B Top', topArmBSubtractGap
        );
      } else {
        totalCuts += topArmBResult.cuts;
      }

      // Front B: use waste from this step's Arm B Top → new slabs
      let frontArmBResult = tryUseFrontFromWaste(frontArmB_width, frontArmB_height, stepLabel, 'Arm B', 'front');
      if (!frontArmBResult) {
        frontArmBResult = calculateSlabsForSurface(
          frontArmB_width, frontArmB_height, 'front', stepLabel, 'Arm B Front'
        );
      }

      // ── Accumulate totals (only count NEW slabs, not reused waste) ───────

      totalTopSlabs += topArmAResult.newSlabsNeeded + topArmBResult.newSlabsNeeded;
      totalFrontSlabs += frontArmAResult.newSlabsNeeded + frontArmBResult.newSlabsNeeded;

      stepResults.push({
        step: i + 1,
        isPlatform: stepDim.isPlatform,
        // Top slabs
        topArmA_slabsNeeded: topArmAResult.newSlabsNeeded,
        topArmA_dimensions: topArmAResult.dimensions,
        topArmA_dimensionsParts: (topArmAResult as any).dimensionsParts ?? [{ text: topArmAResult.dimensions, fromWaste: false }],
        topArmA_width: topArmA_width,
        topArmA_depth: topArmA_depth,
        topArmA_wasteUsed: topArmAResult.wasteUsed,
        topArmA_wasteSource: topArmAResult.wasteSource,
        topArmB_slabsNeeded: topArmBResult.newSlabsNeeded,
        topArmB_dimensions: topArmBResult.dimensions,
        topArmB_dimensionsParts: (topArmBResult as any).dimensionsParts ?? [{ text: topArmBResult.dimensions, fromWaste: false }],
        topArmB_width: topArmB_width,
        topArmB_depth: topArmB_depth,
        topArmB_wasteUsed: topArmBResult.wasteUsed,
        topArmB_wasteSource: topArmBResult.wasteSource,
        // Front slabs
        frontArmA_slabsNeeded: frontArmAResult.newSlabsNeeded,
        frontArmA_dimensions: frontArmAResult.dimensions,
        frontArmA_dimensionsParts: (frontArmAResult as any).dimensionsParts ?? [{ text: frontArmAResult.dimensions, fromWaste: false }],
        frontArmA_width: frontArmA_width,
        frontArmA_height: frontArmA_height,
        frontArmA_wasteUsed: frontArmAResult.wasteUsed,
        frontArmA_wasteSource: frontArmAResult.wasteSource,
        frontArmB_slabsNeeded: frontArmBResult.newSlabsNeeded,
        frontArmB_dimensions: frontArmBResult.dimensions,
        frontArmB_dimensionsParts: (frontArmBResult as any).dimensionsParts ?? [{ text: frontArmBResult.dimensions, fromWaste: false }],
        frontArmB_width: frontArmB_width,
        frontArmB_height: frontArmB_height,
        frontArmB_wasteUsed: frontArmBResult.wasteUsed,
        frontArmB_wasteSource: frontArmBResult.wasteSource,
      });
    }

    // ── Calculate adhesive ────────────────────────────────────────────────

    const adhesiveThicknessNum = parseFloat(adhesiveThickness) || 0.5;
    const adhesiveConsumption = adhesiveThicknessNum * 12; // kg/m²

    const topAdhesiveNeeded = totalTopSurfaceArea * adhesiveConsumption;
    const frontAdhesiveNeeded = totalFrontSurfaceArea * adhesiveConsumption;
    const totalAdhesiveNeeded = topAdhesiveNeeded + frontAdhesiveNeeded;

    // ── Set result ────────────────────────────────────────────────────────

    setSlabCalculationResult({
      stepResults,
      totalTopSlabs,
      totalFrontSlabs,
      totalSlabs: totalTopSlabs + totalFrontSlabs,
      totalCuts,
      wasteList,
      totalTopSurfaceArea,
      totalFrontSurfaceArea,
      topAdhesiveNeeded,
      frontAdhesiveNeeded,
      totalAdhesiveNeeded,
      slabDimensionsMap: Array.from(slabDimensionsMap.entries()).map(([dim, count]) => ({ dim, count })),
      cornerJoint,
      topDominantArm,
      frontDominantArm,
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

  // ── Calculate adhesive materials ──────────────────────────────────────

  useEffect(() => {
    if (slabCalculationResult && slabCalculationResult.totalAdhesiveNeeded > 0) {
      const totalAdhesiveKg = slabCalculationResult.totalAdhesiveNeeded;
      const standardBagSize = 20;
      const bagsNeeded = Math.max(1, Math.ceil(totalAdhesiveKg / standardBagSize));

      const materials = [
        {
          name: 'Tile Adhesive',
          amount: bagsNeeded,
          unit: `${standardBagSize}kg bags`
        }
      ];

      setAdhesiveMaterials(materials);

      if (onAdhesiveMaterialsCalculated) {
        onAdhesiveMaterialsCalculated(materials);
      }
    }
  }, [slabCalculationResult]);

  // ── Calculate slab transport ──────────────────────────────────────────

  useEffect(() => {
    if (calculateTransport && selectedTransportCarrier && slabCalculationResult) {
      const totalSlabs = slabCalculationResult.totalSlabs || 0;
      if (totalSlabs > 0) {
        const slabsPerTrip = 2;
        const trips = Math.ceil(totalSlabs / slabsPerTrip);
        const transportHours = (trips * 10) / 60;

        if (onSlabsTransportCalculated) {
          onSlabsTransportCalculated(transportHours);
        }
      }
    }
  }, [calculateTransport, selectedTransportCarrier, slabCalculationResult]);

  // ── Calculate installation tasks ──────────────────────────────────────

  useEffect(() => {
    if (slabCalculationResult && taskTemplates.length > 0 && slabCalculationResult.slabDimensionsMap) {
      const findClosestTileInstallationTask = (width: number, length: number) => {
        const tileInstallationTasks = taskTemplates.filter((t: any) =>
          t.name.toLowerCase().startsWith('tile installation')
        );

        if (tileInstallationTasks.length === 0) return null;

        const tasksWithDimensions = tileInstallationTasks.map((task: any) => {
          const match = task.name.match(/(\d+)\s*x\s*(\d+)/i);
          if (match) {
            return { task, width: parseInt(match[1]), length: parseInt(match[2]) };
          }
          return null;
        }).filter(Boolean);

        if (tasksWithDimensions.length === 0) {
          return tileInstallationTasks[0];
        }

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

      const installationTasks: any[] = [];
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

  // ─── RENDER ───────────────────────────────────────────────────────────

  if (!stairResult) return null;

  return (
    <div className="mt-8 bg-gray-800 p-6 rounded-lg text-white">
      <h3 className="text-xl font-semibold text-white mb-4">
        {t('calculator:slab_requirements_for_stairs')} - L-Shape
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Left column */}
        <div className="space-y-4">
          {/* Slab dimensions */}
          <div>
            <h4 className="text-lg font-medium text-white mb-2">{t('calculator:slab_dimensions_label')}</h4>
            <div className="space-y-2">
              {slabDimensions.map((slab) => (
                <div key={slab.size} className="flex items-center">
                  <input
                    type="radio"
                    id={`lshape-slab-${slab.size}`}
                    checked={selectedSlabDimension === slab.size}
                    onChange={() => setSelectedSlabDimension(slab.size)}
                    className="h-4 w-4 text-blue-600 rounded"
                  />
                  <label htmlFor={`lshape-slab-${slab.size}`} className="ml-2 text-sm text-gray-300">
                    {slab.size} cm
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Placement */}
          <div>
            <h4 className="text-lg font-medium text-white mb-2">{t('calculator:fronts_and_front_steps_label')}</h4>
            <div className="space-y-2">
              {slabPlacementOptions.map((option) => (
                <div key={option.id} className="flex items-center">
                  <input
                    type="radio"
                    id={`lshape-placement-${option.id}`}
                    checked={selectedPlacement === option.id}
                    onChange={() => setSelectedPlacement(option.id)}
                    className="h-4 w-4 text-blue-600 rounded"
                  />
                  <label htmlFor={`lshape-placement-${option.id}`} className="ml-2 text-sm text-gray-300">
                    {option.label}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Corner joint type */}
          <div>
            <h4 className="text-lg font-medium text-white mb-2">Corner Joint Type (Top Slabs)</h4>
            <div className="space-y-2">
              {cornerJointOptions.map((option) => (
                <div key={option.id} className="flex items-center">
                  <input
                    type="radio"
                    id={`lshape-corner-${option.id}`}
                    checked={cornerJoint === option.id}
                    onChange={() => setCornerJoint(option.id)}
                    className="h-4 w-4 text-blue-600 rounded"
                  />
                  <label htmlFor={`lshape-corner-${option.id}`} className="ml-2 text-sm text-gray-300">
                    {option.label}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Top dominant arm (only for butt joint) */}
          {cornerJoint === 'buttJoint' && (
            <div>
              <h4 className="text-lg font-medium text-white mb-2">Top Slab Dominant Arm</h4>
              <div className="space-y-2">
                {armDominanceOptions.map((option) => (
                  <div key={option.id} className="flex items-center">
                    <input
                      type="radio"
                      id={`lshape-topdom-${option.id}`}
                      checked={topDominantArm === option.id}
                      onChange={() => setTopDominantArm(option.id)}
                      className="h-4 w-4 text-blue-600 rounded"
                    />
                    <label htmlFor={`lshape-topdom-${option.id}`} className="ml-2 text-sm text-gray-300">
                      {option.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Front dominant arm */}
          <div>
            <h4 className="text-lg font-medium text-white mb-2">Front Slab Dominant Arm</h4>
            <div className="space-y-2">
              {armDominanceOptions.map((option) => (
                <div key={option.id} className="flex items-center">
                  <input
                    type="radio"
                    id={`lshape-frontdom-${option.id}`}
                    checked={frontDominantArm === option.id}
                    onChange={() => setFrontDominantArm(option.id)}
                    className="h-4 w-4 text-blue-600 rounded"
                  />
                  <label htmlFor={`lshape-frontdom-${option.id}`} className="ml-2 text-sm text-gray-300">
                    {option.label}
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Adhesive thickness */}
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
              Consumption: {((parseFloat(adhesiveThickness) || 0.5) * 12).toFixed(1)} kg/m²
            </p>
          </div>

          {/* Cutting option */}
          <div>
            <h4 className="text-lg font-medium text-white mb-2">{t('calculator:slab_cutting_long_ways_label')}</h4>
            <div className="space-y-2">
              {cuttingOptions.map((option) => (
                <div key={option.type} className="flex items-center">
                  <input
                    type="radio"
                    id={`lshape-cutting-${option.type}`}
                    checked={selectedCutting === option.type}
                    onChange={() => setSelectedCutting(option.type)}
                    className="h-4 w-4 text-blue-600 rounded"
                  />
                  <label htmlFor={`lshape-cutting-${option.type}`} className="ml-2 text-sm text-gray-300">
                    {option.description}
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Results ──────────────────────────────────────────────────────── */}
      {slabCalculationResult && (
        <div>
          <h4 className="text-lg font-medium text-white mb-3">{t('calculator:slab_details_label')}</h4>

          {/* Corner joint info */}
          <div className="bg-blue-900 text-white text-sm rounded p-3 mb-3 border border-blue-700">
            <p className="font-semibold">
              Corner: {cornerJoint === 'mitre45' ? '45° Mitre Cut' : `Butt Joint (${topDominantArm === 'armA' ? 'Arm A' : 'Arm B'} dominant on top)`}
            </p>
            <p>Front dominant: {frontDominantArm === 'armA' ? 'Arm A' : 'Arm B'}</p>
          </div>

          {/* Step-by-step slab details table */}
          <div className="overflow-x-auto border border-gray-700 rounded-lg">
            <table className="w-full bg-gray-700 rounded-lg text-sm">
              <thead>
                <tr className="border-b border-gray-600">
                  <th className="py-2 px-3 text-left text-gray-300">Step</th>
                  <th className="py-2 px-3 text-left text-gray-300">Surface</th>
                  <th className="py-2 px-3 text-left text-gray-300">Arm</th>
                  <th className="py-2 px-3 text-left text-gray-300">Slabs</th>
                  <th className="py-2 px-3 text-left text-gray-300">Dimensions</th>
                  <th className="py-2 px-3 text-left text-gray-300">Surface Size (cm)</th>
                </tr>
              </thead>
              <tbody>
                {slabCalculationResult.stepResults.map((result: any) => (
                  <React.Fragment key={`step-${result.step}`}>
                    {/* Top Arm A */}
                    <tr className="border-b border-gray-600">
                      <td className="py-2 px-3 text-gray-300" rowSpan={4}>
                        {result.step}
                        {result.isPlatform && <span className="text-xs text-blue-400 block">Platform</span>}
                      </td>
                      <td className="py-2 px-3 text-gray-300">Top</td>
                      <td className="py-2 px-3 text-gray-300">
                        A {cornerJoint === 'buttJoint' && topDominantArm === 'armA' ? '★' : ''}
                      </td>
                      <td className="py-2 px-3 text-gray-300">{result.topArmA_slabsNeeded}</td>
                      <td className="py-2 px-3">
                        {(result.topArmA_dimensionsParts ?? [{ text: result.topArmA_dimensions, fromWaste: false }]).map((part: { text: string; fromWaste: boolean }, pi: number) => (
                          <span key={pi}>
                            {pi > 0 && ' + '}
                            <span className={part.fromWaste ? '!text-green-400' : ''}>{part.text}</span>
                          </span>
                        ))}
                      </td>
                      <td className="py-2 px-3 text-gray-400">
                        {result.topArmA_width.toFixed(1)} × {result.topArmA_depth.toFixed(1)}
                      </td>
                    </tr>
                    {/* Top Arm B */}
                    <tr className="border-b border-gray-600">
                      <td className="py-2 px-3 text-gray-300">Top</td>
                      <td className="py-2 px-3 text-gray-300">
                        B {cornerJoint === 'buttJoint' && topDominantArm === 'armB' ? '★' : ''}
                      </td>
                      <td className="py-2 px-3 text-gray-300">{result.topArmB_slabsNeeded}</td>
                      <td className="py-2 px-3">
                        {(result.topArmB_dimensionsParts ?? [{ text: result.topArmB_dimensions, fromWaste: false }]).map((part: { text: string; fromWaste: boolean }, pi: number) => (
                          <span key={pi}>
                            {pi > 0 && ' + '}
                            <span className={part.fromWaste ? '!text-green-400' : ''}>{part.text}</span>
                          </span>
                        ))}
                      </td>
                      <td className="py-2 px-3 text-gray-400">
                        {result.topArmB_width.toFixed(1)} × {result.topArmB_depth.toFixed(1)}
                      </td>
                    </tr>
                    {/* Front Arm A */}
                    <tr className="border-b border-gray-600">
                      <td className="py-2 px-3 text-gray-300">Front</td>
                      <td className="py-2 px-3 text-gray-300">
                        A {frontDominantArm === 'armA' ? '★' : ''}
                      </td>
                      <td className="py-2 px-3 text-gray-300">{result.frontArmA_slabsNeeded}</td>
                      <td className="py-2 px-3">
                        {(result.frontArmA_dimensionsParts ?? [{ text: result.frontArmA_dimensions, fromWaste: false }]).map((part: { text: string; fromWaste: boolean }, pi: number) => (
                          <span key={pi}>
                            {pi > 0 && ' + '}
                            <span className={part.fromWaste ? '!text-green-400' : ''}>{part.text}</span>
                          </span>
                        ))}
                      </td>
                      <td className="py-2 px-3 text-gray-400">
                        {result.frontArmA_width.toFixed(1)} × {result.frontArmA_height.toFixed(1)}
                      </td>
                    </tr>
                    {/* Front Arm B */}
                    <tr className="border-b border-gray-600">
                      <td className="py-2 px-3 text-gray-300">Front</td>
                      <td className="py-2 px-3 text-gray-300">
                        B {frontDominantArm === 'armB' ? '★' : ''}
                      </td>
                      <td className="py-2 px-3 text-gray-300">{result.frontArmB_slabsNeeded}</td>
                      <td className="py-2 px-3">
                        {(result.frontArmB_dimensionsParts ?? [{ text: result.frontArmB_dimensions, fromWaste: false }]).map((part: { text: string; fromWaste: boolean }, pi: number) => (
                          <span key={pi}>
                            {pi > 0 && ' + '}
                            <span className={part.fromWaste ? '!text-green-400' : ''}>{part.text}</span>
                          </span>
                        ))}
                      </td>
                      <td className="py-2 px-3 text-gray-400">
                        {result.frontArmB_width.toFixed(1)} × {result.frontArmB_height.toFixed(1)}
                      </td>
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary cards */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-700 p-4 rounded">
              <h5 className="font-medium mb-2">{t('calculator:total_step_slabs_needed_label')} (Top)</h5>
              <p className="text-xl">{slabCalculationResult.totalTopSlabs}</p>
            </div>
            <div className="bg-gray-700 p-4 rounded">
              <h5 className="font-medium mb-2">{t('calculator:total_front_slabs_needed_label')}</h5>
              <p className="text-xl">{slabCalculationResult.totalFrontSlabs}</p>
            </div>
            <div className="bg-gray-700 p-4 rounded">
              <h5 className="font-medium mb-2">{t('calculator:total_cuts_required_label')}</h5>
              <p className="text-xl">{slabCalculationResult.totalCuts}</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-700 p-4 rounded">
              <h5 className="font-medium mb-2">{t('calculator:total_slabs_needed_label')}</h5>
              <p className="text-xl">{slabCalculationResult.totalSlabs}</p>
            </div>
            <div className="bg-gray-700 p-4 rounded">
              <h5 className="font-medium mb-2">Adhesive Needed</h5>
              <p className="text-xl">{slabCalculationResult.totalAdhesiveNeeded.toFixed(1)} kg</p>
              <p className="text-sm text-gray-400">
                Top: {slabCalculationResult.topAdhesiveNeeded.toFixed(1)} kg |
                Front: {slabCalculationResult.frontAdhesiveNeeded.toFixed(1)} kg
              </p>
            </div>
          </div>

          {/* Waste materials */}
          {wasteMaterials.length > 0 && (
            <div className="mt-6">
              <h4 className="text-lg font-medium text-white mb-3">{t('calculator:waste_material_available_for_reuse_label')}</h4>
              <div className="overflow-x-auto border border-gray-700 rounded-lg">
                <table className="w-full bg-gray-700 rounded-lg text-sm">
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

export default LShapeStairsSlabs;
