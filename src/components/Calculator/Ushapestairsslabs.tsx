import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface SlabDimension { size: string; width: number; length: number; }
interface SlabCuttingOption { type: string; description: string; }

interface StepDimension {
  height: number; tread: number; isFirst: boolean; remainingTread: number; buriedDepth?: number;
  armA_length: number; armBL_length: number; armBR_length: number;
  armA_innerLength: number; armB_innerLength: number; isPlatform: boolean;
}

interface UShapeStairResult {
  totalSteps: number; totalArmALength: number; totalArmBLength: number;
  materials: any[]; stepDimensions: StepDimension[]; sideOverhang: number;
}

interface WasteMaterial { width: number; length: number; source: string; canBeRotated?: boolean; }
interface CutCalculation { dimension: number; count: number; }

interface UShapeStairsSlabsProps {
  stairResult: UShapeStairResult | null; slabType?: string; taskBreakdown?: any[];
  slabThicknessTop?: number; slabThicknessFront?: number; overhangFront?: number;
  stepTread?: number; stepConfig?: 'frontsOnTop' | 'stepsToFronts'; gapBetweenSlabs?: number;
  calculateTransport?: boolean; selectedTransportCarrier?: any; transportDistance?: string;
  taskTemplates?: any[];
  onCutsCalculated?: (cuts: { lengthCuts: CutCalculation[], widthCuts: CutCalculation[] }) => void;
  onAdhesiveMaterialsCalculated?: (materials: any[]) => void;
  onSlabsTransportCalculated?: (transportHours: number) => void;
  onInstallationTasksCalculated?: (tasks: any[]) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

const UShapeStairsSlabs: React.FC<UShapeStairsSlabsProps> = ({
  stairResult, slabType = 'porcelain', taskBreakdown = [],
  slabThicknessTop = 0, slabThicknessFront = 0, overhangFront = 0,
  stepTread = 30, stepConfig = 'frontsOnTop', gapBetweenSlabs = 2,
  calculateTransport = false, selectedTransportCarrier = null, transportDistance = '30',
  taskTemplates = [],
  onCutsCalculated, onAdhesiveMaterialsCalculated, onSlabsTransportCalculated, onInstallationTasksCalculated
}) => {
  const { t } = useTranslation(['calculator', 'utilities', 'common']);

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
    { id: 'buttJoint', label: 'Butt joint (Arm A covers both corners)' },
    { id: 'mitre45', label: '45° mitre cut (both corners)' },
  ];

  const [selectedSlabDimension, setSelectedSlabDimension] = useState<string>(slabDimensions[0].size);
  const [selectedPlacement, setSelectedPlacement] = useState<string>('longWay');
  const [selectedCutting, setSelectedCutting] = useState<string>('oneCut');
  const [adhesiveThickness, setAdhesiveThickness] = useState<string>('0.5');
  const [cornerJoint, setCornerJoint] = useState<string>('buttJoint');
  const [slabCalculationResult, setSlabCalculationResult] = useState<any>(null);

  const needsCut = (actual: number, required: number): boolean => Math.abs(actual - required) > 0.1;

  useEffect(() => {
    if (stairResult) calculateSlabs();
  }, [stairResult, selectedSlabDimension, selectedPlacement, gapBetweenSlabs, selectedCutting, adhesiveThickness, cornerJoint, stepConfig]);

  // ─── MAIN CALCULATION ──────────────────────────────────────────────────

  const calculateSlabs = () => {
    if (!stairResult || !selectedSlabDimension) return;
    const selectedSlab = slabDimensions.find(s => s.size === selectedSlabDimension);
    if (!selectedSlab) return;

    const gapCm = (gapBetweenSlabs ?? 2) / 10;
    let totalTopSlabs = 0, totalFrontSlabs = 0, totalCuts = 0;
    let totalTopSurfaceArea = 0, totalFrontSurfaceArea = 0;
    const stepResults: any[] = [];
    const wasteList: WasteMaterial[] = [];
    const lengthCutsMap = new Map<number, number>();
    const widthCutsMap = new Map<number, number>();
    const slabDimensionsMap = new Map<string, number>();

    const trackCut = (dimension: number, type: 'length' | 'width', count: number = 1) => {
      const map = type === 'length' ? lengthCutsMap : widthCutsMap;
      const sizes = [30, 60, 90, 120];
      let closest = sizes[0], minDiff = Math.abs(sizes[0] - dimension);
      for (const s of sizes) { const d = Math.abs(s - dimension); if (d < minDiff) { minDiff = d; closest = s; } }
      map.set(closest, (map.get(closest) || 0) + count);
    };

    const trackSurfaceArea = (w: number, l: number, type: 'top' | 'front', count: number = 1) => {
      const area = (w * l / 10000) * count;
      if (type === 'top') totalTopSurfaceArea += area; else totalFrontSurfaceArea += area;
    };

    const trackSlabDimension = (w: number, l: number, count: number = 1) => {
      const key = `${Math.round(w)}x${Math.round(l)}`;
      slabDimensionsMap.set(key, (slabDimensionsMap.get(key) || 0) + count);
    };

    let slabWidth: number, slabLength: number;
    if (selectedPlacement === 'longWay') {
      slabWidth = Math.max(selectedSlab.width, selectedSlab.length);
      slabLength = Math.min(selectedSlab.width, selectedSlab.length);
    } else {
      slabWidth = Math.min(selectedSlab.width, selectedSlab.length);
      slabLength = Math.max(selectedSlab.width, selectedSlab.length);
    }

    // ── tryUseFrontFromWaste ──────────────────────────────────────────────
    const tryUseFrontFromWaste = (
      frontWidth: number, frontHeight: number, stepLabel: string, armLabel: string, surfaceType: 'front'
    ): any | null => {
      if (frontWidth <= 0 || frontHeight <= 0) return null;
      const armTopWaste = wasteList.filter(w =>
        w.source.includes(stepLabel + ' ') && w.source.includes(armLabel) && w.source.includes('Top') &&
        (w.width >= frontHeight || w.length >= frontHeight) && w.width > 1 && w.length > 1
      );
      if (armTopWaste.length === 0) return null;

      const wasteSource = armTopWaste[0].source;
      const slabsNeededWithoutGaps = Math.ceil((frontWidth + gapCm) / (slabWidth + gapCm));
      const totalGaps = slabsNeededWithoutGaps > 0 ? (slabsNeededWithoutGaps - 1) * gapCm : 0;
      let cuts = 0;
      const dimParts: string[] = [];

      if (selectedCutting === 'oneCut') {
        const fullCount = Math.max(0, slabsNeededWithoutGaps - 1);
        const covered = fullCount * slabWidth;
        const remaining = frontWidth - covered - totalGaps;
        if (remaining <= 0.1) {
          for (let p = 0; p < slabsNeededWithoutGaps; p++) {
            dimParts.push(`1x(${slabWidth}x${frontHeight.toFixed(1)}cm)`);
            trackSlabDimension(slabWidth, frontHeight); trackSurfaceArea(slabWidth, frontHeight, surfaceType);
            if (needsCut(slabLength, frontHeight)) { cuts++; trackCut(frontHeight, 'length'); }
          }
        } else {
          for (let p = 0; p < fullCount; p++) {
            dimParts.push(`1x(${slabWidth}x${frontHeight.toFixed(1)}cm)`);
            trackSlabDimension(slabWidth, frontHeight); trackSurfaceArea(slabWidth, frontHeight, surfaceType);
            if (needsCut(slabLength, frontHeight)) { cuts++; trackCut(frontHeight, 'length'); }
          }
          dimParts.push(`1x(${remaining.toFixed(1)}x${frontHeight.toFixed(1)}cm)`);
          trackSlabDimension(remaining, frontHeight); trackSurfaceArea(remaining, frontHeight, surfaceType);
          cuts++; trackCut(remaining, 'width');
          if (needsCut(slabLength, frontHeight)) { cuts++; trackCut(frontHeight, 'length'); }
        }
      } else {
        if (slabsNeededWithoutGaps > 1) {
          const fullCount = Math.max(0, slabsNeededWithoutGaps - 2);
          const covered = fullCount * slabWidth;
          const remaining = frontWidth - covered - totalGaps;
          const equalW = remaining / 2;
          if (remaining <= 0.1 || equalW <= 0.1) {
            const count = Math.max(1, slabsNeededWithoutGaps - 1);
            for (let p = 0; p < count; p++) {
              dimParts.push(`1x(${slabWidth}x${frontHeight.toFixed(1)}cm)`);
              trackSlabDimension(slabWidth, frontHeight); trackSurfaceArea(slabWidth, frontHeight, surfaceType);
              if (needsCut(slabLength, frontHeight)) { cuts++; trackCut(frontHeight, 'length'); }
            }
          } else {
            for (let p = 0; p < fullCount; p++) {
              dimParts.push(`1x(${slabWidth}x${frontHeight.toFixed(1)}cm)`);
              trackSlabDimension(slabWidth, frontHeight); trackSurfaceArea(slabWidth, frontHeight, surfaceType);
              if (needsCut(slabLength, frontHeight)) { cuts++; trackCut(frontHeight, 'length'); }
            }
            for (let p = 0; p < 2; p++) {
              dimParts.push(`1x(${equalW.toFixed(1)}x${frontHeight.toFixed(1)}cm)`);
              trackSlabDimension(equalW, frontHeight); trackSurfaceArea(equalW, frontHeight, surfaceType);
              cuts++; trackCut(equalW, 'width');
              if (needsCut(slabLength, frontHeight)) { cuts++; trackCut(frontHeight, 'length'); }
            }
          }
        } else {
          dimParts.push(`1x(${frontWidth.toFixed(1)}x${frontHeight.toFixed(1)}cm)`);
          trackSlabDimension(frontWidth, frontHeight); trackSurfaceArea(frontWidth, frontHeight, surfaceType);
          cuts++; trackCut(frontWidth, 'width');
          if (needsCut(slabLength, frontHeight)) { cuts++; trackCut(frontHeight, 'length'); }
        }
      }

      const dimensionsParts = dimParts.map((p, idx) => ({
        text: idx === dimParts.length - 1 ? `${p} [waste: ${wasteSource}]` : p, fromWaste: true
      }));

      // Remove all matching waste
      for (let idx = wasteList.length - 1; idx >= 0; idx--) {
        const w = wasteList[idx];
        if (w.source.includes(stepLabel + ' ') && w.source.includes(armLabel) && w.source.includes('Top')) {
          wasteList.splice(idx, 1);
        }
      }
      totalCuts += cuts;

      return { reused: true, slabsNeeded: dimParts.length, newSlabsNeeded: 0, dimensions: dimensionsParts.map(p => p.text).join(' + '),
        dimensionsParts, cuts, wasteUsed: true, wasteSource };
    };

    // ── tryReuseWaste ─────────────────────────────────────────────────────
    const tryReuseWaste = (
      surfaceWidth: number, surfaceDepth: number, surfaceType: 'top' | 'front',
      stepLabel: string, armLabel: string, subtractGap = false, excludeArmSources?: string[]
    ): any | null => {
      if (surfaceWidth <= 0 || surfaceDepth <= 0) return null;
      const usable = wasteList.filter(w => {
        if (excludeArmSources && excludeArmSources.some(ex => w.source.includes(ex))) return false;
        const fN = w.width >= surfaceDepth && w.length >= surfaceWidth;
        const fR = w.length >= surfaceDepth && w.width >= surfaceWidth;
        return (fN || fR) && w.width > 1 && w.length > 1;
      }).sort((a, b) => a.width * a.length - b.width * b.length);

      if (usable.length === 0) return null;
      const sel = usable[0];
      const fN = sel.width >= surfaceDepth && sel.length >= surfaceWidth;
      const fR = sel.length >= surfaceDepth && sel.width >= surfaceWidth;
      const rotated = !fN && fR;

      let cuts = 0;
      if (needsCut(rotated ? sel.length : sel.width, surfaceDepth)) { cuts++; trackCut(surfaceDepth, 'length'); }
      if (needsCut(rotated ? sel.width : sel.length, surfaceWidth)) { cuts++; trackCut(surfaceWidth, 'width'); }

      const slabW = subtractGap ? Math.max(0, surfaceWidth - gapCm) : surfaceWidth;
      const dims = `1x(${slabW.toFixed(1)}x${surfaceDepth.toFixed(1)}cm) [waste${rotated ? ' rotated' : ''}: ${sel.source}]`;
      trackSlabDimension(slabW, surfaceDepth); trackSurfaceArea(slabW, surfaceDepth, surfaceType);

      const idx = wasteList.indexOf(sel);
      if (idx > -1) wasteList.splice(idx, 1);

      // Generate remainder
      if (rotated) {
        const dR = sel.length - surfaceDepth, wR = sel.width - surfaceWidth;
        if (dR > 1 && dR * sel.width >= wR * sel.length) wasteList.push({ width: sel.width, length: dR, source: `Rem ${sel.source}` });
        else if (wR > 1) wasteList.push({ width: wR, length: sel.length, source: `Rem ${sel.source}` });
        else if (dR > 1) wasteList.push({ width: sel.width, length: dR, source: `Rem ${sel.source}` });
      } else {
        const dR = sel.width - surfaceDepth, wR = sel.length - surfaceWidth;
        if (dR > 1 && dR * sel.length >= wR * sel.width) wasteList.push({ width: dR, length: sel.length, source: `Rem ${sel.source}` });
        else if (wR > 1) wasteList.push({ width: sel.width, length: wR, source: `Rem ${sel.source}` });
        else if (dR > 1) wasteList.push({ width: dR, length: sel.length, source: `Rem ${sel.source}` });
      }

      return { reused: true, slabsNeeded: 1, newSlabsNeeded: 0, dimensions: dims,
        dimensionsParts: [{ text: dims, fromWaste: true }], cuts, wasteUsed: true, wasteSource: sel.source };
    };

    // ── calculateSlabsForSurface ──────────────────────────────────────────
    const calculateSlabsForSurface = (
      surfaceWidth: number, surfaceDepth: number, surfaceType: 'top' | 'front',
      stepLabel: string, armLabel: string, subtractGap = false
    ) => {
      if (surfaceWidth <= 0 || surfaceDepth <= 0) {
        return { slabsNeeded: 0, newSlabsNeeded: 0, dimensions: '-', dimensionsParts: [{ text: '-', fromWaste: false }], cuts: 0, wasteUsed: false, wasteSource: '' };
      }
      let slabsNeeded = 0, newSlabsNeeded = 0, dimensions = '', cuts = 0;
      let dimensionsParts: { text: string; fromWaste: boolean }[] = [];
      const slabsCount = Math.ceil((surfaceWidth + gapCm) / (slabWidth + gapCm));
      const totalGaps = (slabsCount - 1) * gapCm;

      const findBestWaste = (w: number, d: number) => {
        return wasteList.filter(waste => {
          const fN = waste.width >= d && waste.length >= w;
          const fR = waste.length >= d && waste.width >= w;
          return (fN || fR) && waste.width > 1 && waste.length > 1;
        }).sort((a, b) => a.width * a.length - b.width * b.length)[0] || null;
      };

      const consumeWaste = (w: WasteMaterial, usedW: number, usedD: number) => {
        const i = wasteList.indexOf(w); if (i > -1) wasteList.splice(i, 1);
        const fN = w.width >= usedD && w.length >= usedW;
        if (fN) {
          const dR = w.width - usedD, wR = w.length - usedW;
          if (dR > 1 && dR * w.length >= wR * w.width) wasteList.push({ width: dR, length: w.length, source: `Rem ${w.source}` });
          else if (wR > 1) wasteList.push({ width: w.width, length: wR, source: `Rem ${w.source}` });
          else if (dR > 1) wasteList.push({ width: dR, length: w.length, source: `Rem ${w.source}` });
        } else {
          const dR = w.length - usedD, wR = w.width - usedW;
          if (dR > 1 && dR * w.width >= wR * w.length) wasteList.push({ width: w.width, length: dR, source: `Rem ${w.source}` });
          else if (wR > 1) wasteList.push({ width: wR, length: w.length, source: `Rem ${w.source}` });
          else if (dR > 1) wasteList.push({ width: w.width, length: dR, source: `Rem ${w.source}` });
        }
      };

      if (surfaceWidth < (slabsCount * slabWidth) + totalGaps) {
        // Needs cutting
        if (selectedCutting === 'oneCut') {
          const fullCount = slabsCount - 1;
          const covered = fullCount * slabWidth;
          const remaining = surfaceWidth - covered - totalGaps;

          if (remaining <= 0.1) {
            slabsNeeded = slabsCount;
            if (needsCut(slabLength, surfaceDepth)) { cuts += slabsNeeded; trackCut(surfaceDepth, 'length', slabsNeeded); }
            const lastW = subtractGap ? slabWidth - gapCm : slabWidth;
            if (subtractGap && slabsNeeded > 1) {
              dimensions = `${slabsNeeded - 1}x(${slabWidth}x${surfaceDepth.toFixed(1)}cm) + 1x(${lastW.toFixed(1)}x${surfaceDepth.toFixed(1)}cm)`;
              trackSurfaceArea(slabWidth, surfaceDepth, surfaceType, slabsNeeded - 1);
              trackSurfaceArea(lastW, surfaceDepth, surfaceType, 1);
              trackSlabDimension(slabWidth, surfaceDepth, slabsNeeded - 1);
              trackSlabDimension(lastW, surfaceDepth, 1);
            } else {
              dimensions = `${slabsNeeded}x(${lastW}x${surfaceDepth.toFixed(1)}cm)`;
              trackSurfaceArea(lastW, surfaceDepth, surfaceType, slabsNeeded);
              trackSlabDimension(lastW, surfaceDepth, slabsNeeded);
            }
            dimensionsParts = [{ text: dimensions, fromWaste: false }];
          } else {
            slabsNeeded = fullCount + 1;
            const lastSlabW = subtractGap ? Math.max(0, remaining - gapCm) : remaining;
            let newCount = 0;
            const parts: { w: number; d: number; fromWaste: boolean; ws?: string }[] = [];

            for (let p = 0; p < fullCount; p++) {
              const pw = findBestWaste(slabWidth, surfaceDepth);
              if (pw) { consumeWaste(pw, slabWidth, surfaceDepth); cuts++; trackCut(surfaceDepth, 'length'); parts.push({ w: slabWidth, d: surfaceDepth, fromWaste: true, ws: pw.source }); }
              else {
                newCount++;
                if (needsCut(slabLength, surfaceDepth)) { cuts++; trackCut(surfaceDepth, 'length'); wasteList.push({ width: slabWidth, length: slabLength - surfaceDepth, source: `${stepLabel} ${armLabel}`, canBeRotated: true }); }
                parts.push({ w: slabWidth, d: surfaceDepth, fromWaste: false });
              }
            }

            const cpw = findBestWaste(remaining, surfaceDepth);
            if (cpw) { consumeWaste(cpw, remaining, surfaceDepth); cuts++; trackCut(remaining, 'width'); if (needsCut(slabLength, surfaceDepth)) { cuts++; trackCut(surfaceDepth, 'length'); } parts.push({ w: lastSlabW, d: surfaceDepth, fromWaste: true, ws: cpw.source }); }
            else {
              newCount++; cuts++; trackCut(remaining, 'width');
              if (remaining > 0.1 && remaining < slabWidth) wasteList.push({ width: slabWidth - remaining, length: slabLength, source: `${stepLabel} ${armLabel}`, canBeRotated: true });
              if (needsCut(slabLength, surfaceDepth)) { cuts++; trackCut(surfaceDepth, 'length'); wasteList.push({ width: remaining, length: slabLength - surfaceDepth, source: `${stepLabel} ${armLabel}`, canBeRotated: true }); }
              parts.push({ w: lastSlabW, d: surfaceDepth, fromWaste: false });
            }

            const strs: string[] = [];
            let ii = 0;
            while (ii < parts.length) {
              const pt = parts[ii];
              if (pt.fromWaste) { const tx = `1x(${pt.w.toFixed(1)}x${pt.d.toFixed(1)}cm) [waste: ${pt.ws}]`; strs.push(tx); dimensionsParts.push({ text: tx, fromWaste: true }); trackSurfaceArea(pt.w, pt.d, surfaceType); trackSlabDimension(pt.w, pt.d); ii++; }
              else {
                let sc = 0;
                while (ii + sc < parts.length && !parts[ii + sc].fromWaste && parts[ii + sc].w === pt.w && parts[ii + sc].d === pt.d) sc++;
                const tx = `${sc}x(${pt.w.toFixed(1)}x${pt.d.toFixed(1)}cm)`;
                strs.push(tx); dimensionsParts.push({ text: tx, fromWaste: false }); trackSurfaceArea(pt.w, pt.d, surfaceType, sc); trackSlabDimension(pt.w, pt.d, sc); ii += sc;
              }
            }
            dimensions = strs.join(' + ');
            newSlabsNeeded = newCount;
          }
        } else {
          // 2 cuts
          if (slabsCount > 1) {
            const fullCount = slabsCount - 2;
            const covered = fullCount * slabWidth;
            const remaining = surfaceWidth - covered - totalGaps;
            const equalW = remaining / 2;

            if (remaining <= 0.1 || equalW <= 0.1) {
              slabsNeeded = Math.max(1, slabsCount - 1);
              if (needsCut(slabLength, surfaceDepth)) { cuts += slabsNeeded; trackCut(surfaceDepth, 'length', slabsNeeded); }
              const lastW = subtractGap ? slabWidth - gapCm : slabWidth;
              dimensions = `${slabsNeeded}x(${lastW}x${surfaceDepth.toFixed(1)}cm)`;
              dimensionsParts = [{ text: dimensions, fromWaste: false }];
              trackSurfaceArea(lastW, surfaceDepth, surfaceType, slabsNeeded);
              trackSlabDimension(lastW, surfaceDepth, slabsNeeded);
            } else {
              slabsNeeded = fullCount + 2;
              const lastPW = subtractGap ? Math.max(0, equalW - gapCm) : equalW;
              let newC = 0;
              const pts: { w: number; d: number; fromWaste: boolean; ws?: string }[] = [];

              for (let p = 0; p < fullCount; p++) {
                const pw = findBestWaste(slabWidth, surfaceDepth);
                if (pw) { consumeWaste(pw, slabWidth, surfaceDepth); cuts++; trackCut(surfaceDepth, 'length'); pts.push({ w: slabWidth, d: surfaceDepth, fromWaste: true, ws: pw.source }); }
                else {
                  newC++;
                  if (needsCut(slabLength, surfaceDepth)) { cuts++; trackCut(surfaceDepth, 'length'); wasteList.push({ width: slabWidth, length: slabLength - surfaceDepth, source: `${stepLabel} ${armLabel}`, canBeRotated: true }); }
                  pts.push({ w: slabWidth, d: surfaceDepth, fromWaste: false });
                }
              }

              for (let p = 0; p < 2; p++) {
                const dw = p === 1 && subtractGap ? lastPW : equalW;
                const pw = findBestWaste(equalW, surfaceDepth);
                if (pw) { consumeWaste(pw, equalW, surfaceDepth); cuts++; trackCut(equalW, 'width'); if (needsCut(slabLength, surfaceDepth)) { cuts++; trackCut(surfaceDepth, 'length'); } pts.push({ w: dw, d: surfaceDepth, fromWaste: true, ws: pw.source }); }
                else {
                  newC++; cuts++; trackCut(equalW, 'width');
                  if (equalW > 0.1 && equalW < slabWidth) wasteList.push({ width: slabWidth - equalW, length: slabLength, source: `${stepLabel} ${armLabel}`, canBeRotated: true });
                  if (needsCut(slabLength, surfaceDepth)) { cuts++; trackCut(surfaceDepth, 'length'); wasteList.push({ width: equalW, length: slabLength - surfaceDepth, source: `${stepLabel} ${armLabel}`, canBeRotated: true }); }
                  pts.push({ w: dw, d: surfaceDepth, fromWaste: false });
                }
              }

              const strs: string[] = [];
              let ii = 0;
              while (ii < pts.length) {
                const pt = pts[ii];
                if (pt.fromWaste) { const tx = `1x(${pt.w.toFixed(1)}x${pt.d.toFixed(1)}cm) [waste: ${pt.ws}]`; strs.push(tx); dimensionsParts.push({ text: tx, fromWaste: true }); trackSurfaceArea(pt.w, pt.d, surfaceType); trackSlabDimension(pt.w, pt.d); ii++; }
                else {
                  let sc = 0;
                  while (ii + sc < pts.length && !pts[ii + sc].fromWaste && pts[ii + sc].w === pt.w && pts[ii + sc].d === pt.d) sc++;
                  const tx = `${sc}x(${pt.w.toFixed(1)}x${pt.d.toFixed(1)}cm)`;
                  strs.push(tx); dimensionsParts.push({ text: tx, fromWaste: false }); trackSurfaceArea(pt.w, pt.d, surfaceType, sc); trackSlabDimension(pt.w, pt.d, sc); ii += sc;
                }
              }
              dimensions = strs.join(' + ');
              newSlabsNeeded = newC;
            }
          } else {
            slabsNeeded = 1; cuts++; trackCut(surfaceWidth, 'width');
            if (surfaceWidth > 0.1 && surfaceWidth < slabWidth) wasteList.push({ width: slabWidth - surfaceWidth, length: slabLength, source: `${stepLabel} ${armLabel}`, canBeRotated: true });
            if (needsCut(slabLength, surfaceDepth)) { cuts++; trackCut(surfaceDepth, 'length'); wasteList.push({ width: surfaceWidth, length: slabLength - surfaceDepth, source: `${stepLabel} ${armLabel}`, canBeRotated: true }); }
            const lastW = subtractGap ? Math.max(0, surfaceWidth - gapCm) : surfaceWidth;
            dimensions = `1x(${lastW.toFixed(1)}x${surfaceDepth.toFixed(1)}cm)`;
            dimensionsParts = [{ text: dimensions, fromWaste: false }];
            trackSurfaceArea(lastW, surfaceDepth, surfaceType); trackSlabDimension(lastW, surfaceDepth);
          }
        }
      } else {
        // No cutting needed on width
        slabsNeeded = slabsCount;
        if (needsCut(slabLength, surfaceDepth)) { cuts += slabsNeeded; trackCut(surfaceDepth, 'length', slabsNeeded); }
        const lastW = subtractGap ? slabWidth - gapCm : slabWidth;
        if (subtractGap && slabsNeeded > 1) {
          dimensions = `${slabsNeeded - 1}x(${slabWidth}x${surfaceDepth.toFixed(1)}cm) + 1x(${lastW.toFixed(1)}x${surfaceDepth.toFixed(1)}cm)`;
          trackSurfaceArea(slabWidth, surfaceDepth, surfaceType, slabsNeeded - 1); trackSurfaceArea(lastW, surfaceDepth, surfaceType, 1);
          trackSlabDimension(slabWidth, surfaceDepth, slabsNeeded - 1); trackSlabDimension(lastW, surfaceDepth, 1);
        } else {
          dimensions = `${slabsNeeded}x(${lastW}x${surfaceDepth.toFixed(1)}cm)`;
          trackSurfaceArea(lastW, surfaceDepth, surfaceType, slabsNeeded); trackSlabDimension(lastW, surfaceDepth, slabsNeeded);
        }
        dimensionsParts = [{ text: dimensions, fromWaste: false }];
      }

      totalCuts += cuts;
      return { slabsNeeded, newSlabsNeeded: newSlabsNeeded || slabsNeeded, dimensions, dimensionsParts, cuts, wasteUsed: (newSlabsNeeded || slabsNeeded) < slabsNeeded, wasteSource: '' };
    }

    // ── Process each step ─────────────────────────────────────────────────
    for (let i = 0; i < stairResult.totalSteps; i++) {
      const stepDim = stairResult.stepDimensions[i];
      const stepLabel = `Step ${i + 1}`;
      const isLastStep = stepDim.isPlatform;

      let topSlabDepth: number;
      if (stepConfig === 'frontsOnTop') {
        topSlabDepth = isLastStep ? stepTread - gapCm : stepTread + slabThicknessFront - 0.5;
      } else {
        topSlabDepth = stepTread - gapCm;
      }

      const prevHeight = i > 0 ? stairResult.stepDimensions[i - 1].height : 0;
      const individualStepHeight = stepDim.height - prevHeight;
      const armA_slabLen = stepDim.armA_length;
      const armB_slabLen = stepDim.armBL_length; // Same for both B sides

      // ── TOP SLABS ──
      let topA_w: number, topA_d: number, topB_w: number, topB_d: number;
      if (cornerJoint === 'buttJoint') {
        topA_w = armA_slabLen; topA_d = topSlabDepth; // A full length (covers both corners)
        topB_w = armB_slabLen - topSlabDepth - gapCm; topB_d = topSlabDepth; // B shortened
      } else {
        topA_w = armA_slabLen; topA_d = topSlabDepth;
        topB_w = armB_slabLen; topB_d = topSlabDepth;
        if (!isLastStep) { totalCuts += 4; trackCut(topSlabDepth, 'length', 4); } // 4 mitre cuts (2 corners × 2)
      }
      const topBSubGap = cornerJoint === 'buttJoint';

      // ── FRONT SLABS ──
      const effFrontH = (stepConfig === 'frontsOnTop' && i > 0)
        ? Math.max(0, individualStepHeight - slabThicknessTop) : individualStepHeight;
      const frontA_w = armA_slabLen - overhangFront;
      const frontA_h = effFrontH;
      const frontB_w = armB_slabLen - overhangFront - slabThicknessFront - gapCm; // B shorter
      const frontB_h = effFrontH;

      // ── Calculate Top A ──
      let topARes = tryReuseWaste(topA_w, topA_d, 'top', stepLabel, 'Arm A Top', false, ['Arm B']);
      if (!topARes) topARes = calculateSlabsForSurface(topA_w, topA_d, 'top', stepLabel, 'Arm A Top', false);
      else totalCuts += topARes.cuts;

      // ── Calculate Front A ──
      let frontARes: any = tryUseFrontFromWaste(frontA_w, frontA_h, stepLabel, 'Arm A', 'front');
      if (!frontARes) frontARes = calculateSlabsForSurface(frontA_w, frontA_h, 'front', stepLabel, 'Arm A Front');

      // ── Calculate Top B (one side, ×2) ──
      let topBRes = tryReuseWaste(topB_w, topB_d, 'top', stepLabel, 'Arm B Top', topBSubGap, ['Arm A']);
      if (!topBRes) topBRes = calculateSlabsForSurface(topB_w, topB_d, 'top', stepLabel, 'Arm B Top', topBSubGap);
      else totalCuts += topBRes.cuts;

      // ── Calculate Front B (one side, ×2) ──
      let frontBRes: any = tryUseFrontFromWaste(frontB_w, frontB_h, stepLabel, 'Arm B', 'front');
      if (!frontBRes) frontBRes = calculateSlabsForSurface(frontB_w, frontB_h, 'front', stepLabel, 'Arm B Front');

      // ── Accumulate (A×1, B×2) ──
      totalTopSlabs += topARes.newSlabsNeeded + (topBRes.newSlabsNeeded * 2);
      totalFrontSlabs += frontARes.newSlabsNeeded + (frontBRes.newSlabsNeeded * 2);
      // Add second B side cuts
      totalCuts += (topBRes.cuts || 0) + (frontBRes.cuts || 0);
      // Add second B side surface area
      if (topB_w > 0 && topB_d > 0) totalTopSurfaceArea += (topB_w * topB_d / 10000);
      if (frontB_w > 0 && frontB_h > 0) totalFrontSurfaceArea += (frontB_w * frontB_h / 10000);

      // Double B slab dimensions in the map (for installation tasks)
      // Re-track all slab dimensions from B results for the second side
      const retrackDims = (dimensionsParts: { text: string; fromWaste: boolean }[]) => {
        if (!dimensionsParts) return;
        for (const part of dimensionsParts) {
          const match = part.text.match(/(\d+)x\(([\d.]+)x([\d.]+)cm\)/);
          if (match) {
            const count = parseInt(match[1]);
            const w = parseFloat(match[2]);
            const d = parseFloat(match[3]);
            if (count > 0 && w > 0 && d > 0) trackSlabDimension(w, d, count);
          }
        }
      };
      retrackDims(topBRes.dimensionsParts);
      retrackDims(frontBRes.dimensionsParts);

      stepResults.push({
        step: i + 1, isPlatform: isLastStep,
        topArmA_slabsNeeded: topARes.newSlabsNeeded, topArmA_dimensions: topARes.dimensions,
        topArmA_dimensionsParts: topARes.dimensionsParts, topArmA_width: topA_w, topArmA_depth: topA_d,
        topArmA_wasteUsed: topARes.wasteUsed, topArmA_wasteSource: topARes.wasteSource,
        topArmB_slabsNeeded: topBRes.newSlabsNeeded * 2, topArmB_slabsNeeded_single: topBRes.newSlabsNeeded,
        topArmB_dimensions: topBRes.dimensions, topArmB_dimensionsParts: topBRes.dimensionsParts,
        topArmB_width: topB_w, topArmB_depth: topB_d,
        topArmB_wasteUsed: topBRes.wasteUsed, topArmB_wasteSource: topBRes.wasteSource,
        frontArmA_slabsNeeded: frontARes.newSlabsNeeded, frontArmA_dimensions: frontARes.dimensions,
        frontArmA_dimensionsParts: frontARes.dimensionsParts, frontArmA_width: frontA_w, frontArmA_height: frontA_h,
        frontArmA_wasteUsed: frontARes.wasteUsed, frontArmA_wasteSource: frontARes.wasteSource,
        frontArmB_slabsNeeded: frontBRes.newSlabsNeeded * 2, frontArmB_slabsNeeded_single: frontBRes.newSlabsNeeded,
        frontArmB_dimensions: frontBRes.dimensions, frontArmB_dimensionsParts: frontBRes.dimensionsParts,
        frontArmB_width: frontB_w, frontArmB_height: frontB_h,
        frontArmB_wasteUsed: frontBRes.wasteUsed, frontArmB_wasteSource: frontBRes.wasteSource,
      });
    }

    // ── Adhesive ──
    const adhThick = parseFloat(adhesiveThickness) || 0.5;
    const adhConsumption = adhThick * 12;
    const topAdh = totalTopSurfaceArea * adhConsumption;
    const frontAdh = totalFrontSurfaceArea * adhConsumption;

    setSlabCalculationResult({
      stepResults, totalTopSlabs, totalFrontSlabs,
      totalSlabs: totalTopSlabs + totalFrontSlabs, totalCuts, wasteList,
      totalTopSurfaceArea, totalFrontSurfaceArea,
      topAdhesiveNeeded: topAdh, frontAdhesiveNeeded: frontAdh,
      totalAdhesiveNeeded: topAdh + frontAdh,
      slabDimensionsMap: Array.from(slabDimensionsMap.entries()).map(([dim, count]) => ({ dim, count })),
      cornerJoint,
    });

    if (onCutsCalculated) {
      onCutsCalculated({
        lengthCuts: Array.from(lengthCutsMap).map(([dimension, count]) => ({ dimension, count })),
        widthCuts: Array.from(widthCutsMap).map(([dimension, count]) => ({ dimension, count })),
      });
    }
  };

  // ── Adhesive materials effect ──
  useEffect(() => {
    if (slabCalculationResult && slabCalculationResult.totalAdhesiveNeeded > 0) {
      const bags = Math.max(1, Math.ceil(slabCalculationResult.totalAdhesiveNeeded / 20));
      const mats = [{ name: 'Tile Adhesive', amount: bags, unit: '20kg bags' }];
      if (onAdhesiveMaterialsCalculated) onAdhesiveMaterialsCalculated(mats);
    }
  }, [slabCalculationResult]);

  // ── Transport effect ──
  useEffect(() => {
    if (calculateTransport && selectedTransportCarrier && slabCalculationResult) {
      const total = slabCalculationResult.totalSlabs || 0;
      if (total > 0) {
        const hours = (Math.ceil(total / 2) * 10) / 60;
        if (onSlabsTransportCalculated) onSlabsTransportCalculated(hours);
      }
    }
  }, [calculateTransport, selectedTransportCarrier, slabCalculationResult]);

  // ── Installation tasks effect ──
  useEffect(() => {
    if (slabCalculationResult && taskTemplates.length > 0 && slabCalculationResult.slabDimensionsMap) {
      const findTask = (w: number, l: number) => {
        const tileTasks = taskTemplates.filter((t: any) => t.name.toLowerCase().startsWith('tile installation'));
        if (tileTasks.length === 0) return null;
        const withDims = tileTasks.map((task: any) => {
          const m = task.name.match(/(\d+)\s*x\s*(\d+)/i);
          return m ? { task, width: parseInt(m[1]), length: parseInt(m[2]) } : null;
        }).filter(Boolean);
        if (withDims.length === 0) return tileTasks[0];
        let closest = withDims[0], minD = Math.sqrt(Math.pow(closest!.width - w, 2) + Math.pow(closest!.length - l, 2));
        for (const td of withDims) {
          const d = Math.sqrt(Math.pow(td!.width - w, 2) + Math.pow(td!.length - l, 2));
          if (d < minD) { minD = d; closest = td; }
        }
        return closest!.task;
      };

      const groups = new Map<string, { task: any; count: number }>();
      for (const entry of slabCalculationResult.slabDimensionsMap) {
        const parts = entry.dim.split('x').map(Number);
        if (parts.length === 2) {
          const task = findTask(parts[0], parts[1]);
          if (task) {
            const existing = groups.get(task.name);
            if (existing) existing.count += entry.count;
            else groups.set(task.name, { task, count: entry.count });
          }
        }
      }

      const tasks = Array.from(groups.values()).map(g => ({
        task: g.task.name, hours: g.count * (g.task.estimated_hours || 0), amount: g.count, unit: g.task.unit || 'piece'
      }));
      if (onInstallationTasksCalculated) onInstallationTasksCalculated(tasks);
    }
  }, [slabCalculationResult, taskTemplates]);

  // ─── RENDER ─────────────────────────────────────────────────────────────

  if (!stairResult) return null;

  return (
    <div className="mt-8 bg-gray-800 p-6 rounded-lg text-white">
      <h3 className="text-xl font-semibold text-white mb-4">
        {t('calculator:slab_requirements_for_stairs')} - U-Shape
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
                    id={`ushape-slab-${slab.size}`}
                    checked={selectedSlabDimension === slab.size}
                    onChange={() => setSelectedSlabDimension(slab.size)}
                    className="h-4 w-4 text-blue-600 rounded"
                  />
                  <label htmlFor={`ushape-slab-${slab.size}`} className="ml-2 text-sm text-gray-300">
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
                    id={`ushape-placement-${option.id}`}
                    checked={selectedPlacement === option.id}
                    onChange={() => setSelectedPlacement(option.id)}
                    className="h-4 w-4 text-blue-600 rounded"
                  />
                  <label htmlFor={`ushape-placement-${option.id}`} className="ml-2 text-sm text-gray-300">
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
                    id={`ushape-corner-${option.id}`}
                    checked={cornerJoint === option.id}
                    onChange={() => setCornerJoint(option.id)}
                    className="h-4 w-4 text-blue-600 rounded"
                  />
                  <label htmlFor={`ushape-corner-${option.id}`} className="ml-2 text-sm text-gray-300">
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
              className="w-full p-2 border rounded bg-gray-700 text-white border-gray-600"
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
                    id={`ushape-cutting-${option.type}`}
                    checked={selectedCutting === option.type}
                    onChange={() => setSelectedCutting(option.type)}
                    className="h-4 w-4 text-blue-600 rounded"
                  />
                  <label htmlFor={`ushape-cutting-${option.type}`} className="ml-2 text-sm text-gray-300">
                    {option.description}
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      {slabCalculationResult && (
        <div>
          <h4 className="text-lg font-medium text-white mb-3">{t('calculator:slab_details_label')}</h4>

          {/* Corner joint info - U-shape: A always dominates */}
          <div className="bg-blue-900 text-white text-sm rounded p-3 mb-3 border border-blue-700">
            <p className="font-semibold">
              Corner: {cornerJoint === 'mitre45' ? '45° Mitre Cut' : 'Butt Joint (Arm A dominant on top)'}
            </p>
            <p>Front dominant: Arm A</p>
          </div>

          <div className="overflow-x-auto border border-gray-700 rounded-lg">
            <table className="w-full bg-gray-700 rounded-lg text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="py-2 px-2 text-left">Step</th>
                  <th className="py-2 px-2 text-left">Surface</th>
                  <th className="py-2 px-2 text-left">Arm</th>
                  <th className="py-2 px-2 text-left">Slabs</th>
                  <th className="py-2 px-2 text-left">Dimensions</th>
                  <th className="py-2 px-2 text-left">Size (cm)</th>
                </tr>
              </thead>
              <tbody>
                {slabCalculationResult.stepResults.map((sr: any, idx: number) => (
                  <React.Fragment key={idx}>
                    {/* Top A */}
                    <tr className="border-b border-gray-700">
                      <td className="py-1 px-2 text-white" rowSpan={6}>
                        {sr.step}{sr.isPlatform ? ' (P)' : ''}
                      </td>
                      <td className="py-1 px-2 text-blue-300">Top</td>
                      <td className="py-1 px-2 text-white">A</td>
                      <td className="py-1 px-2 text-gray-300">{sr.topArmA_slabsNeeded}</td>
                      <td className="py-1 px-2 text-xs">
                        {(sr.topArmA_dimensionsParts ?? [{ text: sr.topArmA_dimensions, fromWaste: false }]).map((part: { text: string; fromWaste: boolean }, pi: number) => (
                          <span key={pi}>
                            {pi > 0 && ' + '}
                            <span className={part.fromWaste ? '!text-green-400' : 'text-gray-300'}>{part.text}</span>
                          </span>
                        ))}
                      </td>
                      <td className="py-1 px-2 text-gray-400 text-xs">{sr.topArmA_width.toFixed(1)}×{sr.topArmA_depth.toFixed(1)}</td>
                    </tr>
                    {/* Top Bl */}
                    <tr className="border-b border-gray-700">
                      <td className="py-1 px-2 text-blue-300">Top</td>
                      <td className="py-1 px-2 text-white">B<sub>{t('calculator:ushape_arm_left_subscript')}</sub></td>
                      <td className="py-1 px-2 text-gray-300">{sr.topArmB_slabsNeeded_single}</td>
                      <td className="py-1 px-2 text-xs">
                        {(sr.topArmB_dimensionsParts ?? [{ text: sr.topArmB_dimensions, fromWaste: false }]).map((part: { text: string; fromWaste: boolean }, pi: number) => (
                          <span key={pi}>
                            {pi > 0 && ' + '}
                            <span className={part.fromWaste ? '!text-green-400' : 'text-gray-300'}>{part.text}</span>
                          </span>
                        ))}
                      </td>
                      <td className="py-1 px-2 text-gray-400 text-xs">{sr.topArmB_width.toFixed(1)}×{sr.topArmB_depth.toFixed(1)}</td>
                    </tr>
                    {/* Top Bp */}
                    <tr className="border-b border-gray-700">
                      <td className="py-1 px-2 text-blue-300">Top</td>
                      <td className="py-1 px-2 text-white">B<sub>{t('calculator:ushape_arm_right_subscript')}</sub></td>
                      <td className="py-1 px-2 text-gray-300">{sr.topArmB_slabsNeeded_single}</td>
                      <td className="py-1 px-2 text-xs">
                        {(sr.topArmB_dimensionsParts ?? [{ text: sr.topArmB_dimensions, fromWaste: false }]).map((part: { text: string; fromWaste: boolean }, pi: number) => (
                          <span key={pi}>
                            {pi > 0 && ' + '}
                            <span className={part.fromWaste ? '!text-green-400' : 'text-gray-300'}>{part.text}</span>
                          </span>
                        ))}
                      </td>
                      <td className="py-1 px-2 text-gray-400 text-xs">{sr.topArmB_width.toFixed(1)}×{sr.topArmB_depth.toFixed(1)}</td>
                    </tr>
                    {/* Front A */}
                    <tr className="border-b border-gray-700">
                      <td className="py-1 px-2 text-orange-300">Front</td>
                      <td className="py-1 px-2 text-white">A</td>
                      <td className="py-1 px-2 text-gray-300">{sr.frontArmA_slabsNeeded}</td>
                      <td className="py-1 px-2 text-xs">
                        {(sr.frontArmA_dimensionsParts ?? [{ text: sr.frontArmA_dimensions, fromWaste: false }]).map((part: { text: string; fromWaste: boolean }, pi: number) => (
                          <span key={pi}>
                            {pi > 0 && ' + '}
                            <span className={part.fromWaste ? '!text-green-400' : 'text-gray-300'}>{part.text}</span>
                          </span>
                        ))}
                      </td>
                      <td className="py-1 px-2 text-gray-400 text-xs">{sr.frontArmA_width.toFixed(1)}×{sr.frontArmA_height.toFixed(1)}</td>
                    </tr>
                    {/* Front Bl */}
                    <tr className="border-b border-gray-700">
                      <td className="py-1 px-2 text-orange-300">Front</td>
                      <td className="py-1 px-2 text-white">B<sub>{t('calculator:ushape_arm_left_subscript')}</sub></td>
                      <td className="py-1 px-2 text-gray-300">{sr.frontArmB_slabsNeeded_single}</td>
                      <td className="py-1 px-2 text-xs">
                        {(sr.frontArmB_dimensionsParts ?? [{ text: sr.frontArmB_dimensions, fromWaste: false }]).map((part: { text: string; fromWaste: boolean }, pi: number) => (
                          <span key={pi}>
                            {pi > 0 && ' + '}
                            <span className={part.fromWaste ? '!text-green-400' : 'text-gray-300'}>{part.text}</span>
                          </span>
                        ))}
                      </td>
                      <td className="py-1 px-2 text-gray-400 text-xs">{sr.frontArmB_width.toFixed(1)}×{sr.frontArmB_height.toFixed(1)}</td>
                    </tr>
                    {/* Front Bp */}
                    <tr className="border-b border-gray-700">
                      <td className="py-1 px-2 text-orange-300">Front</td>
                      <td className="py-1 px-2 text-white">B<sub>{t('calculator:ushape_arm_right_subscript')}</sub></td>
                      <td className="py-1 px-2 text-gray-300">{sr.frontArmB_slabsNeeded_single}</td>
                      <td className="py-1 px-2 text-xs">
                        {(sr.frontArmB_dimensionsParts ?? [{ text: sr.frontArmB_dimensions, fromWaste: false }]).map((part: { text: string; fromWaste: boolean }, pi: number) => (
                          <span key={pi}>
                            {pi > 0 && ' + '}
                            <span className={part.fromWaste ? '!text-green-400' : 'text-gray-300'}>{part.text}</span>
                          </span>
                        ))}
                      </td>
                      <td className="py-1 px-2 text-gray-400 text-xs">{sr.frontArmB_width.toFixed(1)}×{sr.frontArmB_height.toFixed(1)}</td>
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

          {/* Waste list */}
          {slabCalculationResult.wasteList && slabCalculationResult.wasteList.length > 0 && (
            <div className="mt-3">
              <p className="text-sm text-gray-400 font-medium mb-1">Remaining waste:</p>
              <div className="flex flex-wrap gap-1">
                {slabCalculationResult.wasteList.map((w: WasteMaterial, i: number) => (
                  <span key={i} className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded">
                    {w.width.toFixed(1)}×{w.length.toFixed(1)}cm ({w.source})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default UShapeStairsSlabs;