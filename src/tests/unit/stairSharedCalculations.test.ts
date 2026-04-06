import { describe, it, expect } from 'vitest';
import {
  computeBuriedDepthBand,
  computeGlobalBuriedDepthAndBestBlockStepHeight,
  computeSingleStepMaterialConfiguration,
  computeStandardLinearTotalLength,
  computeStepCountFromInputs,
  computeTotalLinearTreadConsumed,
  computeLShapeMasonryArmLengthsCm,
  computeUShapeFrontFacePackageCm,
  computeUShapeMasonryArmLengthsCm,
  findMortarConfig,
  type StairMaterialOption,
} from '../../components/Calculator/stairSharedCalculations';

const defaultMaterials: StairMaterialOption[] = [
  { id: 'blocks4', name: '4-inch Blocks', height: 21, width: 10, length: 44, isInches: true },
  { id: 'blocks7', name: '6-inch Blocks', height: 21, width: 14, length: 44, isInches: true },
  { id: 'bricks', name: 'Standard Bricks (9x6x21)', height: 6, width: 9, length: 21, isInches: false },
];

describe('stairSharedCalculations', () => {
  it('findMortarConfig rejects mortar space that cannot fit in allowed ranges', () => {
    expect(findMortarConfig(50, 2)).toBeNull();
  });

  it('findMortarConfig fills single-course gap only with podsadzka in range', () => {
    expect(findMortarConfig(2.5, 0)).toEqual({ podsadzka: 2.5, jointSize: 0 });
    expect(findMortarConfig(0.5, 0)).toBeNull();
    expect(findMortarConfig(4, 0)).toBeNull();
  });

  it('findMortarConfig splits multi-joint space exactly within ranges', () => {
    const r = findMortarConfig(12, 3);
    expect(r).not.toBeNull();
    expect(r!.podsadzka + 3 * r!.jointSize).toBeCloseTo(12, 5);
  });

  it('computeSingleStepMaterialConfiguration uses enough block courses to fill height (no hole)', () => {
    const r = computeSingleStepMaterialConfiguration({
      targetStepHeight: 52,
      selectedMaterials: ['blocks4'],
      materialOptions: defaultMaterials,
      brickOrientation: 'flat',
      minBuriedDepthCm: 3,
      maxBuriedDepthCm: 13,
      globalBuriedDepthCm: 5,
    });
    expect(r.materialId).toBe('blocks4');
    expect(r.blocks).toBe(4);
    const log = r._log;
    const mortarSum = log.totalSpaceForMortar;
    expect(log.totalBlockHeight + mortarSum).toBeCloseTo(52, 5);
  });

  it('computeStepCountFromInputs rounds step count', () => {
    const r = computeStepCountFromInputs(90, 17);
    expect(r).not.toBeNull();
    expect(r!.stepCount).toBe(5);
    expect(r!.actualStepHeight).toBeCloseTo(18, 5);
  });

  it('computeStandardLinearTotalLength equals sum of per-step tread depths', () => {
    const stepTread = 30;
    const overhang = 2;
    const slabFront = 3.25;
    const adjusted = stepTread - overhang;
    const stepCount = 4;
    const total = computeStandardLinearTotalLength(adjusted, slabFront, stepCount);
    const consumed = computeTotalLinearTreadConsumed(stepCount, adjusted, slabFront);
    expect(total).toBe(consumed);
    expect(total).toBeCloseTo(3 * adjusted + (adjusted - slabFront), 5);
  });

  it('computeTotalLinearTreadConsumed is identical for L and U validation inputs', () => {
    const stepCount = 3;
    const treadReduction = 28;
    const slabFront = 3;
    const v = computeTotalLinearTreadConsumed(stepCount, treadReduction, slabFront);
    expect(v).toBe(28 + 28 + (28 - 3));
  });

  it('computeSingleStepMaterialConfiguration uses extra burial when blocks exceed riser height (no cutting)', () => {
    const r = computeSingleStepMaterialConfiguration({
      targetStepHeight: 27,
      selectedMaterials: ['blocks7'],
      materialOptions: defaultMaterials,
      brickOrientation: 'flat',
      minBuriedDepthCm: 1,
      maxBuriedDepthCm: 13,
      globalBuriedDepthCm: 5,
    });
    expect(r.needsCutting).toBe(false);
    expect(r.materialId).toBe('blocks7');
  });

  it('computeBuriedDepthBand is consistent across stair types', () => {
    expect(computeBuriedDepthBand(5)).toEqual({
      minBuriedDepthCm: 1,
      maxBuriedDepthCm: 13,
      defaultGlobalBuriedCm: 5,
    });
  });

  it('global burial + per-step material agree for shared numeric scenario', () => {
    const targetBuriedCm = 5;
    const { minBuriedDepthCm, maxBuriedDepthCm } = computeBuriedDepthBand(targetBuriedCm);
    const { globalBuriedDepthCm, bestBlockStepHeight } = computeGlobalBuriedDepthAndBestBlockStepHeight({
      totalHeightNum: 90,
      stepCount: 5,
      actualStepHeight: 18,
      targetBuriedCm,
      selectedMaterials: ['blocks7'],
      materialOptions: defaultMaterials,
      brickOrientation: 'flat',
      slabThicknessTopCm: 2,
    });
    expect(bestBlockStepHeight).toBeCloseTo(18, 5);
    expect(globalBuriedDepthCm).toBeGreaterThanOrEqual(minBuriedDepthCm);
    expect(globalBuriedDepthCm).toBeLessThanOrEqual(maxBuriedDepthCm);

    const step1 = computeSingleStepMaterialConfiguration({
      targetStepHeight: bestBlockStepHeight * 1 - 2 + globalBuriedDepthCm,
      selectedMaterials: ['blocks7'],
      materialOptions: defaultMaterials,
      brickOrientation: 'flat',
      minBuriedDepthCm,
      maxBuriedDepthCm,
      globalBuriedDepthCm,
    });
    expect(step1.materialId).toBe('blocks7');
    expect(step1.totalDepthBelowFinishedCm).toBeGreaterThanOrEqual(minBuriedDepthCm);
    expect(step1.totalDepthBelowFinishedCm).toBeLessThanOrEqual(maxBuriedDepthCm);
  });

  it('computeUShapeFrontFacePackageCm sums overhang and front slab only (slab input = tile+glue)', () => {
    expect(computeUShapeFrontFacePackageCm({ overhangFrontCm: 2, slabThicknessFrontCm: 3 })).toBe(5);
  });

  it('computeUShapeMasonryArmLengthsCm applies 2× package on A and 1× on B', () => {
    const face = 6;
    const r = computeUShapeMasonryArmLengthsCm({
      armA_externalCm: 100,
      armB_externalCm: 80,
      facePackageCm: face,
    });
    expect(r.armA_masonryCm).toBe(100 - 2 * face);
    expect(r.armB_masonryCm).toBe(80 - face);
  });

  it('computeUShapeMasonryArmLengthsCm clamps at zero', () => {
    const r = computeUShapeMasonryArmLengthsCm({
      armA_externalCm: 10,
      armB_externalCm: 4,
      facePackageCm: 10,
    });
    expect(r.armA_masonryCm).toBe(0);
    expect(r.armB_masonryCm).toBe(0);
  });

  it('computeLShapeMasonryArmLengthsCm subtracts slab only on platform', () => {
    const non = computeLShapeMasonryArmLengthsCm({
      armA_externalCm: 100,
      armB_externalCm: 100,
      isPlatform: false,
      slabThicknessFrontCm: 3,
    });
    expect(non.armA_masonryCm).toBe(100);
    expect(non.armB_masonryCm).toBe(100);

    const plat = computeLShapeMasonryArmLengthsCm({
      armA_externalCm: 72,
      armB_externalCm: 72,
      isPlatform: true,
      slabThicknessFrontCm: 3,
    });
    expect(plat.armA_masonryCm).toBe(69);
    expect(plat.armB_masonryCm).toBe(69);
  });
});
