/**
 * Material Usage Defaults — default thickness/sand/mortar values for calculators.
 * Stored in localStorage per company. Used to pre-fill calculator inputs.
 */

const STORAGE_KEY = "landscapeManager_materialUsageDefaults";

export type CalculatorKey = "paving_calculator" | "slab_calculator" | "concrete_slabs_calculator" | "artificial_grass_calculator" | "natural_turf_calculator" | "wall_calculator" | "decorative_stones_calculator";

export interface ThicknessConfig {
  [calcKey: string]: Record<string, number>;
}

export interface SandConfig {
  [calcKey: string]: string;
}

export interface MortarConfig {
  slab_mortar: string;
  brick_mortar: string;
}

export interface MaterialUsageDefaults {
  thicknessConfig: ThicknessConfig;
  sandConfig: SandConfig;
  mortarConfig: MortarConfig;
}

const DEFAULT_THICKNESS: ThicknessConfig = {
  paving_calculator: { type1_thickness: 10, sand_thickness: 5, monoblock_height: 6 },
  slab_calculator: { type1_thickness: 10, mortar_thickness: 3, slab_thickness: 2 },
  concrete_slabs_calculator: { type1_thickness: 10, sand_thickness: 5, concrete_slab_thickness: 6 },
  artificial_grass_calculator: { type1_thickness: 10, sand_thickness: 5 },
  natural_turf_calculator: { type1_thickness: 10, soil_thickness: 5 },
  decorative_stones_calculator: { type1_thickness: 10, decorative_stones_depth: 5 },
  wall_calculator: {},
};

const DEFAULT_SAND: SandConfig = {
  wall_calculator: "Building sand",
  slab_calculator: "Granite Sand",
  concrete_slabs_calculator: "Granite Sand",
  artificial_grass_calculator: "Granite Sand",
  paving_calculator: "Granite Sand",
};

const DEFAULT_MORTAR: MortarConfig = {
  slab_mortar: "1:5",
  brick_mortar: "1:4",
};

function getStorageKey(companyId: string | null): string {
  return companyId ? `${STORAGE_KEY}_${companyId}` : STORAGE_KEY;
}

export function getMaterialUsageDefaults(companyId: string | null): MaterialUsageDefaults {
  try {
    const raw = localStorage.getItem(getStorageKey(companyId));
    if (raw) {
      const parsed = JSON.parse(raw);
      // Deep merge thickness per calculator so new keys (e.g. slab_thickness) are preserved
      const mergedThickness: ThicknessConfig = {};
      const allCalcKeys = new Set([
        ...Object.keys(DEFAULT_THICKNESS),
        ...Object.keys(parsed.thicknessConfig || {}),
      ]);
      allCalcKeys.forEach((key) => {
        mergedThickness[key] = {
          ...DEFAULT_THICKNESS[key],
          ...(parsed.thicknessConfig?.[key] || {}),
        };
      });
      return {
        thicknessConfig: mergedThickness,
        sandConfig: { ...DEFAULT_SAND, ...parsed.sandConfig },
        mortarConfig: { ...DEFAULT_MORTAR, ...parsed.mortarConfig },
      };
    }
  } catch {}
  return {
    thicknessConfig: { ...DEFAULT_THICKNESS },
    sandConfig: { ...DEFAULT_SAND },
    mortarConfig: { ...DEFAULT_MORTAR },
  };
}

export function saveMaterialUsageDefaults(companyId: string | null, data: MaterialUsageDefaults): void {
  try {
    localStorage.setItem(getStorageKey(companyId), JSON.stringify(data));
  } catch {}
}

/** Map calculator type (used in ObjectCardModal, PathCreationModal, Calculator page) to storage key */
function calcTypeToKey(calculatorType: string): CalculatorKey | null {
  switch (calculatorType) {
    case "paving":
      return "paving_calculator";
    case "slab":
      return "slab_calculator";
    case "concreteSlabs":
      return "concrete_slabs_calculator";
    case "grass":
      return "artificial_grass_calculator";
    case "turf":
      return "natural_turf_calculator";
    case "wall":
      return "wall_calculator";
    case "decorativeStones":
      return "decorative_stones_calculator";
    default:
      return null;
  }
}

/**
 * Returns default calculator inputs (tape1ThicknessCm, sandThicknessCm, mortarThicknessCm, monoBlocksHeightCm)
 * for the given calculator type. Used to pre-fill when savedInputs doesn't have these values.
 */
export function getCalculatorInputDefaults(
  calculatorType: string,
  companyId: string | null
): Record<string, string> {
  const key = calcTypeToKey(calculatorType);
  if (!key) return {};

  const defaults = getMaterialUsageDefaults(companyId);
  const thickness = defaults.thicknessConfig[key];
  if (!thickness) return {};

  const result: Record<string, string> = {};
  if (thickness.type1_thickness != null) result.tape1ThicknessCm = String(thickness.type1_thickness);
  if (thickness.sand_thickness != null) result.sandThicknessCm = String(thickness.sand_thickness);
  if (thickness.soil_thickness != null) result.soilThicknessCm = String(thickness.soil_thickness);
  if (thickness.mortar_thickness != null) result.mortarThicknessCm = String(thickness.mortar_thickness);
  if (thickness.slab_thickness != null) result.slabThicknessCm = String(thickness.slab_thickness);
  if (thickness.monoblock_height != null) result.monoBlocksHeightCm = String(thickness.monoblock_height);
  if (thickness.concrete_slab_thickness != null) result.concreteSlabThicknessCm = String(thickness.concrete_slab_thickness);
  if (thickness.decorative_stones_depth != null) result.decorativeDepthCm = String(thickness.decorative_stones_depth);

  return result;
}
