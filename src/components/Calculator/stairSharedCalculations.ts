/**
 * Shared stair masonry math used by Standard, L-shape, and U-shape calculators.
 * Keep behavior in sync with the historical inline implementations — tests lock outputs.
 */

export const MORTAR_RANGE = { min: 0.5, max: 3 } as const;
export const PODSADZKA_RANGE = { min: 1, max: 3 } as const;

/** Float tolerance for mortar sum checks (cm). */
const MORTAR_EPS = 1e-6;

export type BrickOrientation = 'flat' | 'side';

export interface StairMaterialOption {
  id: string;
  name: string;
  height: number;
  width: number;
  length: number;
  isInches: boolean;
}

/**
 * Split vertical space into podsadzka + equal horizontal joints so the sum equals `totalSpaceForMortar`.
 * All values must stay within allowed ranges — no “clamp” that leaves a hole.
 */
export function findMortarConfig(
  totalSpaceForMortar: number,
  numberOfJoints: number
): { podsadzka: number; jointSize: number } | null {
  if (totalSpaceForMortar < -MORTAR_EPS) return null;

  if (numberOfJoints === 0) {
    if (
      totalSpaceForMortar < PODSADZKA_RANGE.min - MORTAR_EPS ||
      totalSpaceForMortar > PODSADZKA_RANGE.max + MORTAR_EPS
    ) {
      return null;
    }
    const p = Math.round(totalSpaceForMortar * 10) / 10;
    if (p < PODSADZKA_RANGE.min - MORTAR_EPS || p > PODSADZKA_RANGE.max + MORTAR_EPS) return null;
    return { podsadzka: p, jointSize: 0 };
  }

  const minMortar = PODSADZKA_RANGE.min + numberOfJoints * MORTAR_RANGE.min;
  const maxMortar = PODSADZKA_RANGE.max + numberOfJoints * MORTAR_RANGE.max;
  if (totalSpaceForMortar < minMortar - MORTAR_EPS || totalSpaceForMortar > maxMortar + MORTAR_EPS) {
    return null;
  }

  const toTry = [2, 1.5, 2.5, 1, 3, 1.2, 1.8, 2.2, 2.8];
  for (const p of toTry) {
    if (p < PODSADZKA_RANGE.min - MORTAR_EPS || p > PODSADZKA_RANGE.max + MORTAR_EPS) continue;
    const jointSize = (totalSpaceForMortar - p) / numberOfJoints;
    if (jointSize >= MORTAR_RANGE.min - MORTAR_EPS && jointSize <= MORTAR_RANGE.max + MORTAR_EPS) {
      return {
        podsadzka: Math.round(p * 10) / 10,
        jointSize: Math.round(jointSize * 10) / 10,
      };
    }
  }
  for (let p = PODSADZKA_RANGE.min; p <= PODSADZKA_RANGE.max + MORTAR_EPS; p += 0.1) {
    const jointSize = (totalSpaceForMortar - p) / numberOfJoints;
    if (jointSize >= MORTAR_RANGE.min - MORTAR_EPS && jointSize <= MORTAR_RANGE.max + MORTAR_EPS) {
      return {
        podsadzka: Math.round(p * 10) / 10,
        jointSize: Math.round(jointSize * 10) / 10,
      };
    }
  }
  return null;
}

/**
 * Allowed burial depth (cm below finished level), derived from user's target.
 * Min: at least 1 cm below finished. Max: target + 8 cm (deeper than input is allowed to avoid cutting blocks).
 */
export function computeBuriedDepthBand(targetBuriedCm: number): {
  minBuriedDepthCm: number;
  maxBuriedDepthCm: number;
  defaultGlobalBuriedCm: number;
} {
  const minBuriedDepthCm = 1;
  const maxBuriedDepthCm = targetBuriedCm + 8;
  const defaultGlobalBuriedCm = Math.min(
    maxBuriedDepthCm,
    Math.max(minBuriedDepthCm, Math.round(targetBuriedCm))
  );
  return { minBuriedDepthCm, maxBuriedDepthCm, defaultGlobalBuriedCm };
}

export function computeStepCountFromInputs(
  totalHeightNum: number,
  stepHeightInput: number
): { stepCount: number; actualStepHeight: number } | null {
  const rawStepCount = totalHeightNum / stepHeightInput;
  const stepCount = Math.round(rawStepCount);
  if (stepCount <= 0) return null;
  const actualStepHeight = totalHeightNum / stepCount;
  return { stepCount, actualStepHeight };
}

/** Sum of per-step tread consumption along a run (L/U validation + Standard total length). */
export function computeTotalLinearTreadConsumed(
  stepCount: number,
  treadReduction: number,
  slabThicknessFrontNum: number
): number {
  let totalTreadConsumed = 0;
  for (let i = 0; i < stepCount; i++) {
    const isLast = i === stepCount - 1;
    totalTreadConsumed += isLast
      ? treadReduction - slabThicknessFrontNum
      : treadReduction;
  }
  return totalTreadConsumed;
}

/** Standard straight-run total horizontal length (cm). */
export function computeStandardLinearTotalLength(
  adjustedStepTread: number,
  slabThicknessFrontNum: number,
  stepCount: number
): number {
  const regularStepTread = adjustedStepTread;
  const lastStepTread = adjustedStepTread - slabThicknessFrontNum;
  return regularStepTread * (stepCount - 1) + lastStepTread;
}

/**
 * One “face package” (cm) along the front of each masonry run: overhang + front slab.
 * The front-slab input is treated as tile + adhesive together — no extra default glue layer.
 * U-shape: subtract 2× from arm A (both corners), 1× from each arm B.
 */
export function computeUShapeFrontFacePackageCm(params: {
  overhangFrontCm: number;
  slabThicknessFrontCm: number;
}): number {
  return (
    Math.max(0, params.overhangFrontCm) + Math.max(0, params.slabThicknessFrontCm)
  );
}

/** Geometric external arm lengths → lengths available for block courses (U-shape). */
export function computeUShapeMasonryArmLengthsCm(params: {
  armA_externalCm: number;
  armB_externalCm: number;
  facePackageCm: number;
}): { armA_masonryCm: number; armB_masonryCm: number } {
  const p = Math.max(0, params.facePackageCm);
  return {
    armA_masonryCm: Math.max(0, params.armA_externalCm - 2 * p),
    armB_masonryCm: Math.max(0, params.armB_externalCm - p),
  };
}

/**
 * L-shape: plan-view geometric external lengths → masonry run lengths for blocks / results table.
 * Last step (platform): subtract front slab thickness from each arm — masonry tread is shorter than lower steps.
 */
export function computeLShapeMasonryArmLengthsCm(params: {
  armA_externalCm: number;
  armB_externalCm: number;
  isPlatform: boolean;
  slabThicknessFrontCm: number;
}): { armA_masonryCm: number; armB_masonryCm: number } {
  if (!params.isPlatform) {
    return {
      armA_masonryCm: Math.max(0, params.armA_externalCm),
      armB_masonryCm: Math.max(0, params.armB_externalCm),
    };
  }
  const s = Math.max(0, params.slabThicknessFrontCm);
  return {
    armA_masonryCm: Math.max(0, params.armA_externalCm - s),
    armB_masonryCm: Math.max(0, params.armB_externalCm - s),
  };
}

export function getBlockHeightWhenFlat(
  materialOption: StairMaterialOption,
  brickOrientation: BrickOrientation
): number {
  if (materialOption.id === 'bricks') {
    return brickOrientation === 'flat' ? materialOption.height : materialOption.width;
  }
  return materialOption.width;
}

export interface StepMaterialLog {
  targetStepHeight: number;
  totalBlockHeight: number;
  totalSpaceForMortar: number;
  numberOfJoints: number;
}

export interface SingleStepMaterialResult {
  materialId: string;
  blocks: number;
  mortarHeight: number;
  podsadzka: number;
  needsCutting: boolean;
  buriedDepth: number;
  totalDepthBelowFinishedCm: number;
  _log: StepMaterialLog;
}

function getBlockHeightForCourse(materialOption: StairMaterialOption, brickOrientation: BrickOrientation): number {
  if (materialOption.id === 'bricks') {
    return brickOrientation === 'flat' ? materialOption.height : materialOption.width;
  }
  return materialOption.width;
}

/** One riser's block + mortar + burial caps (shared by all three stair types). */
export function computeSingleStepMaterialConfiguration(params: {
  targetStepHeight: number;
  selectedMaterials: string[];
  materialOptions: StairMaterialOption[];
  brickOrientation: BrickOrientation;
  minBuriedDepthCm: number;
  maxBuriedDepthCm: number;
  globalBuriedDepthCm: number;
}): SingleStepMaterialResult {
  const { selectedMaterials, materialOptions, brickOrientation, maxBuriedDepthCm, globalBuriedDepthCm, minBuriedDepthCm } =
    params;
  const targetStepHeight = params.targetStepHeight;

  let bestConfiguration: {
    materialId: string;
    blocks: number;
    mortarHeight: number;
    podsadzka: number;
    needsCutting: boolean;
    buriedDepth: number;
    _log: StepMaterialLog;
  } | null = null;

  for (const materialId of selectedMaterials) {
    const materialOption = materialOptions.find(m => m.id === materialId);
    if (!materialOption) continue;

    const blockHeight = getBlockHeightForCourse(materialOption, brickOrientation);
    const maxBlocksNeeded = Math.max(1, Math.ceil(targetStepHeight / blockHeight) + 8);

    for (let blocksNeeded = 1; blocksNeeded <= maxBlocksNeeded; blocksNeeded++) {
      const totalBlockHeight = blocksNeeded * blockHeight;
      const numberOfJoints = blocksNeeded - 1;
      const totalSpaceForMortar = targetStepHeight - totalBlockHeight;

      if (totalSpaceForMortar >= -MORTAR_EPS) {
        const mortarConfig = findMortarConfig(totalSpaceForMortar, numberOfJoints);

        if (mortarConfig) {
          const mortarSum =
            mortarConfig.podsadzka + numberOfJoints * mortarConfig.jointSize;
          if (Math.abs(mortarSum - totalSpaceForMortar) > 0.11) {
            continue;
          }
          bestConfiguration = {
            materialId,
            blocks: blocksNeeded,
            mortarHeight: mortarConfig.jointSize,
            podsadzka: mortarConfig.podsadzka,
            needsCutting: false,
            buriedDepth: 0,
            _log: { targetStepHeight, totalBlockHeight, totalSpaceForMortar, numberOfJoints },
          };
          break;
        }
      }

      const minMortar = PODSADZKA_RANGE.min + numberOfJoints * MORTAR_RANGE.min;
      if (totalSpaceForMortar < minMortar - MORTAR_EPS) {
        const buriedDepth = minMortar - totalSpaceForMortar;
        if (buriedDepth <= maxBuriedDepthCm + MORTAR_EPS) {
          bestConfiguration = {
            materialId,
            blocks: blocksNeeded,
            mortarHeight: 1,
            podsadzka: 2,
            needsCutting: false,
            buriedDepth,
            _log: { targetStepHeight, totalBlockHeight, totalSpaceForMortar, numberOfJoints },
          };
          break;
        }
      }
    }
    if (bestConfiguration) break;
  }

  if (!bestConfiguration) {
    const mat = materialOptions.find(m => m.id === selectedMaterials[0]);
    const fallbackBlockHeight = mat
      ? mat.id === 'bricks'
        ? brickOrientation === 'flat'
          ? mat.height
          : mat.width
        : mat.width
      : 10;
    const fallbackBlocks = Math.ceil(targetStepHeight / fallbackBlockHeight);
    const fallbackTotalBlockHeight = fallbackBlocks * fallbackBlockHeight;
    bestConfiguration = {
      materialId: selectedMaterials[0],
      blocks: fallbackBlocks,
      mortarHeight: 1,
      podsadzka: 2,
      needsCutting: true,
      buriedDepth: 0,
      _log: {
        targetStepHeight,
        totalBlockHeight: fallbackTotalBlockHeight,
        totalSpaceForMortar: targetStepHeight - fallbackTotalBlockHeight,
        numberOfJoints: fallbackBlocks - 1,
      },
    };
  }

  const rawExtra = bestConfiguration.buriedDepth || 0;
  const maxExtraMortarBurial = Math.max(0, maxBuriedDepthCm - globalBuriedDepthCm);
  const cappedExtra = Math.min(rawExtra, maxExtraMortarBurial);
  const totalDepthBelowFinishedCm = Math.min(
    maxBuriedDepthCm,
    Math.max(minBuriedDepthCm, globalBuriedDepthCm + cappedExtra)
  );

  return {
    materialId: bestConfiguration.materialId,
    blocks: bestConfiguration.blocks,
    mortarHeight: bestConfiguration.mortarHeight,
    podsadzka: bestConfiguration.podsadzka,
    needsCutting: bestConfiguration.needsCutting,
    buriedDepth: totalDepthBelowFinishedCm,
    totalDepthBelowFinishedCm,
    _log: bestConfiguration._log,
  };
}

/**
 * Chooses global burial baseline (cm below finished level). Masonry height per step is measured from the buried
 * start line (first course) to the slab underside: cumulative rise − top slab + chosen burial depth.
 * If default burial would force cutting on any step, searches integer depths in
 * [minBuriedDepthCm, maxBuriedDepthCm] for a no-cut configuration; picks depth closest to target, then shallower on tie.
 * Per-step extra burial still comes from {@link computeSingleStepMaterialConfiguration}.
 */
export function computeGlobalBuriedDepthAndBestBlockStepHeight(params: {
  totalHeightNum: number;
  stepCount: number;
  actualStepHeight: number;
  targetBuriedCm: number;
  selectedMaterials: string[];
  materialOptions: StairMaterialOption[];
  brickOrientation: BrickOrientation;
  /** Reduces cumulative masonry height per step (same as slab thickness on top). */
  slabThicknessTopCm?: number;
}): { globalBuriedDepthCm: number; bestBlockStepHeight: number } {
  const slabThicknessTopCm = params.slabThicknessTopCm ?? 0;
  const { minBuriedDepthCm, maxBuriedDepthCm, defaultGlobalBuriedCm } = computeBuriedDepthBand(
    params.targetBuriedCm
  );

  const blockStepHeight = params.actualStepHeight;

  const allStepsNoCut = (buriedDepth: number): boolean => {
    for (let i = 0; i < params.stepCount; i++) {
      const targetStepHeight =
        blockStepHeight * (i + 1) - slabThicknessTopCm + buriedDepth;
      const stepMat = computeSingleStepMaterialConfiguration({
        targetStepHeight,
        selectedMaterials: params.selectedMaterials,
        materialOptions: params.materialOptions,
        brickOrientation: params.brickOrientation,
        minBuriedDepthCm,
        maxBuriedDepthCm,
        globalBuriedDepthCm: buriedDepth,
      });
      if (stepMat.needsCutting) {
        return false;
      }
    }
    return true;
  };

  if (allStepsNoCut(defaultGlobalBuriedCm)) {
    return { globalBuriedDepthCm: defaultGlobalBuriedCm, bestBlockStepHeight: blockStepHeight };
  }

  let bestBuried: number | null = null;
  let bestDiff = Infinity;

  const lo = Math.ceil(minBuriedDepthCm);
  const hi = Math.floor(maxBuriedDepthCm);
  for (let buriedDepth = lo; buriedDepth <= hi; buriedDepth++) {
    if (!allStepsNoCut(buriedDepth)) continue;
    const diff = Math.abs(buriedDepth - params.targetBuriedCm);
    const better =
      bestBuried === null ||
      diff < bestDiff - 1e-9 ||
      (Math.abs(diff - bestDiff) < 1e-9 && buriedDepth < bestBuried);
    if (better) {
      bestDiff = diff;
      bestBuried = buriedDepth;
    }
  }

  if (bestBuried !== null) {
    return { globalBuriedDepthCm: bestBuried, bestBlockStepHeight: blockStepHeight };
  }

  return {
    globalBuriedDepthCm: defaultGlobalBuriedCm,
    bestBlockStepHeight: blockStepHeight,
  };
}
