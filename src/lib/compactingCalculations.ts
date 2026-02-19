import { CompactorOption } from '../components/Calculator/CompactorSelector';

interface CompactingCalculation {
  numberOfLayers: number;
  totalPasses: number;
  timePerM2: number; // in hours
  compactorTaskName: string;
}

/**
 * Calculate compacting time based on compactor and material parameters
 * @param compactor - Selected compactor
 * @param depthCm - Total depth to be compacted (cm)
 * @param materialType - 'sand' or 'type1'
 * @returns Calculation details
 */
export const calculateCompactingTime = (
  compactor: CompactorOption,
  depthCm: number,
  materialType: 'sand' | 'type1'
): CompactingCalculation => {
  // Calculate number of layers
  const numberOfLayers = Math.ceil(depthCm / compactor.maxLayer);
  
  // Calculate total passes (layers + 1)
  const totalPasses = numberOfLayers + 1;
  
  // Get normalized tempo based on material
  const coefficient = compactor.materialCoefficient[materialType];
  const effectiveTempo = compactor.normalizedTempo / coefficient;
  
  // Time per m² (in hours)
  const timePerM2 = 1 / effectiveTempo;
  
  // Task name mapping
  const taskNameMap: { [key: string]: string } = {
    'small_compactor': 'Compacting with small compactor',
    'medium_compactor': 'Compacting with medium compactor',
    'large_compactor': 'Compacting with large compactor',
    'maly_walec': 'Compacting with small roller'
  };
  
  const compactorTaskName = taskNameMap[compactor.id] || 'Compacting';
  
  return {
    numberOfLayers,
    totalPasses,
    timePerM2,
    compactorTaskName
  };
};

/**
 * Calculate total compacting hours for given area
 * @param areaM2 - Surface area in m²
 * @param compactor - Selected compactor
 * @param depthCm - Total depth to be compacted (cm)
 * @param materialType - 'sand' or 'type1'
 * @returns Total hours (already accounting for layers + 1 passes)
 */
export const calculateTotalCompactingHours = (
  areaM2: number,
  compactor: CompactorOption,
  depthCm: number,
  materialType: 'sand' | 'type1'
): number => {
  const calc = calculateCompactingTime(compactor, depthCm, materialType);
  return areaM2 * calc.timePerM2 * calc.totalPasses;
};
