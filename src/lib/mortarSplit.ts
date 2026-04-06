/** Aligned with WallCalculator / SlabCalculator mortar math: volume ratio, then mass via component densities. */

const CEMENT_DENSITY_KG_M3 = 1500;
const SAND_DENSITY_KG_M3 = 1600;

export function getMortarMixRatioProportion(mixRatio: string | undefined = '1:4'): {
  cementProportion: number;
  sandProportion: number;
} {
  const ratio = mixRatio || '1:4';
  const [cementPartRaw, sandPartRaw] = ratio.split(':').map(Number);
  const cementPart = Number.isFinite(cementPartRaw) ? cementPartRaw : 1;
  const sandPart = Number.isFinite(sandPartRaw) ? sandPartRaw : 4;
  const totalParts = cementPart + sandPart;
  return {
    cementProportion: cementPart / totalParts,
    sandProportion: sandPart / totalParts,
  };
}

/**
 * Given total mortar mass (kg) and a mix string like "1:4", splits into cement (bags) and sand (tonnes)
 * using the same volume-then-mass path as the wall calculator.
 */
export function splitTotalMortarKgToCementSand(
  totalMortarKg: number,
  mixRatio: string | undefined
): { cementBags: number; sandTonnes: number; cementWeightKg: number; sandWeightKg: number } {
  const { cementProportion, sandProportion } = getMortarMixRatioProportion(mixRatio);
  const rhoMix = cementProportion * CEMENT_DENSITY_KG_M3 + sandProportion * SAND_DENSITY_KG_M3;
  const volumeM3 = totalMortarKg / rhoMix;
  const cementWeightKg = volumeM3 * cementProportion * CEMENT_DENSITY_KG_M3;
  const sandWeightKg = volumeM3 * sandProportion * SAND_DENSITY_KG_M3;
  const cementBags = Math.ceil(cementWeightKg / 25);
  const sandTonnes = sandWeightKg / 1000;
  return { cementBags, sandTonnes, cementWeightKg, sandWeightKg };
}

/** For mixing-mortar batches (125 kg), same as wall: bag-rounded cement + sand tonnes. */
export function totalMortarWeightKgForMixingFromMaterials(
  materials: { name: string; unit: string; amount: number }[]
): number {
  let cementBags = 0;
  let sandTonnes = 0;
  for (const m of materials) {
    if (m.name === 'Cement' && m.unit === 'bags') cementBags += m.amount;
    if (m.unit === 'tonnes') sandTonnes += m.amount;
  }
  return cementBags * 25 + sandTonnes * 1000;
}

export function getStairTransportMaterialCapacityType(material: {
  name: string;
  unit: string;
}): 'bricks' | 'blocks' | 'cement' | 'sand' | null {
  if (material.name === 'Cement' && material.unit === 'bags') return 'cement';
  if (material.unit === 'tonnes') return 'sand';
  if (material.unit === 'pieces') {
    return material.name.toLowerCase().includes('brick') ? 'bricks' : 'blocks';
  }
  return null;
}
